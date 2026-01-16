"use strict";

var MetadataSearchDialog = {
  zotero: null,
  item: null,
  onLoad: function () {
    this.init().catch(function (err) {
      try {
        if (MetadataSearchDialog.zotero) {
          MetadataSearchDialog.zotero.logError(err);
        }
      } catch (e) {}
    });
  },
  onUnload: function () {},

  init: async function () {
    var args = (window.arguments && window.arguments[0]) || {};
    this.zotero = args.Zotero || (window.opener && window.opener.Zotero);
    if (!this.zotero) {
      alert("Zotero is not available in this window.");
      return;
    }

    var itemID = args.itemID;
    if (!itemID) {
      alert("No item ID provided for Metadata Search.");
      return;
    }

    if (this.zotero.Items.getAsync) {
      this.item = await this.zotero.Items.getAsync(itemID);
    } else {
      this.item = this.zotero.Items.get(itemID);
    }
    if (!this.item || !this.item.isRegularItem()) {
      alert("Selected item is not a regular item.");
      return;
    }

    this.render();
  },

  render: function () {
    var doc = document;
    var container = doc.getElementById("content-container");
    clearNode(container);

    container.appendChild(createHeading(doc, "Item Metadata"));

    var itemTitle = this.item.getField("title");
    var creators = this.item
      .getCreators()
      .map(function (c) {
        return (c.firstName || "") + " " + (c.lastName || "");
      })
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);

    var fields = getItemFields(this.item);

    container.appendChild(
      createFieldRow(doc, "title", itemTitle || "", false),
    );
    container.appendChild(
      createFieldRow(doc, "creators", creators.join(", "), false),
    );
    Object.keys(fields).forEach(function (key) {
      if (key === "title") {
        return;
      }
      container.appendChild(createFieldRow(doc, key, fields[key], false));
    });

    var searchOptions = createSearchOptions(doc, this.zotero);
    container.appendChild(searchOptions.node);

    var buttonRow = doc.createElement("hbox");
    buttonRow.setAttribute("style", "margin-top: 10px;");
    buttonRow.setAttribute("align", "center");
    buttonRow.setAttribute("pack", "start");

    var updateButton = doc.createElement("button");
    updateButton.id = "update";
    updateButton.setAttribute("label", "Update");
    updateButton.disabled = true;

    var closeButton = doc.createElement("button");
    closeButton.setAttribute("label", "Close");
    closeButton.addEventListener("command", function () {
      window.close();
    });

    updateButton.setAttribute("style", "margin-right: 8px;");
    buttonRow.appendChild(updateButton);
    buttonRow.appendChild(closeButton);
    container.appendChild(buttonRow);

    var searchRow = doc.createElement("hbox");
    searchRow.setAttribute("style", "margin-top: 10px;");
    searchRow.setAttribute("align", "center");
    searchRow.setAttribute("pack", "start");

    var searchButton = doc.createElement("button");
    searchButton.setAttribute("label", "Search");
    searchButton.setAttribute(
      "style",
      "padding: 4px 12px; max-width: 110px;",
    );
    searchRow.appendChild(searchButton);
    container.appendChild(searchRow);

    var progressLabel = doc.createElement("label");
    progressLabel.id = "search-progress";
    progressLabel.setAttribute("style", "margin-top: 12px; font-style: italic;");
    container.appendChild(progressLabel);

    var resultsContainer = doc.createElement("vbox");
    resultsContainer.id = "search-results";
    resultsContainer.setAttribute("style", "margin-top: 10px;");
    container.appendChild(resultsContainer);

    var updateButtonState = function () {
      var anyChecked = getCheckedBoxes(resultsContainer).length > 0;
      updateButton.disabled = !anyChecked;
    };

    updateButton.addEventListener("command", async function () {
      var checkedBoxes = getCheckedBoxes(resultsContainer);
      var desiredType = null;
      var creatorDataList = [];
      var fieldUpdates = [];

      for (var i = 0; i < checkedBoxes.length; i++) {
        var checkbox = checkedBoxes[i];
        var fieldName = checkbox.getAttribute("data-field-name");
        var fieldValue = checkbox.getAttribute("data-field-value");
        var creatorData = checkbox.getAttribute("data-creator-data");

        if (fieldName === "itemType" && fieldValue) {
          desiredType = fieldValue;
          continue;
        }
        if (fieldName === "creators" && creatorData) {
          creatorDataList.push(JSON.parse(creatorData));
          continue;
        }
        fieldUpdates.push({
          name: fieldName,
          value: fieldValue,
        });
      }

      if (desiredType) {
        setItemType(this.item, desiredType);
      }

      if (creatorDataList.length) {
        this.item.setCreators(creatorDataList[creatorDataList.length - 1]);
      }

      for (var j = 0; j < fieldUpdates.length; j++) {
        var update = fieldUpdates[j];
        var fieldID = this.zotero.ItemFields.getID(update.name);
        if (this.zotero.ItemFields.isValidForType(fieldID, this.item.itemTypeID)) {
          this.item.setField(update.name, update.value);
        }
      }

      await saveItem(this.item);
      window.close();
    }.bind(this));

    searchButton.addEventListener(
      "command",
      async function () {
        progressLabel.setAttribute("value", "Searching...");
        clearNode(resultsContainer);
        searchButton.disabled = true;

        var results = [];
        var searches = [];

        if (searchOptions.crossrefCheckbox.checked) {
          searches.push(searchCrossRef(itemTitle || "", creators));
        }
        if (searchOptions.dblpCheckbox.checked) {
          searches.push(searchDBLP(itemTitle || "", creators));
        }

        var wrapped = searches.map(function (promise) {
          return promise.then(
            function (value) {
              return { status: "fulfilled", value: value };
            },
            function (error) {
              return { status: "rejected", reason: error };
            },
          );
        });

        var settled = await Promise.all(wrapped);
        for (var i = 0; i < settled.length; i++) {
          if (settled[i].status === "fulfilled") {
            results = results.concat(settled[i].value);
          }
        }

        results.sort(function (a, b) {
          return a.similarity - b.similarity;
        });

        progressLabel.setAttribute(
          "value",
          "Found " + results.length + " results",
        );

        results.forEach(function (result, index) {
          result._autoCheck = index === 0;
          resultsContainer.appendChild(
            renderResultSection(doc, result, updateButtonState),
          );
        });

        var bibPromises = [];
        results.forEach(function (result) {
          if (result.source === "DBLP" && (result.bibUrl || result.bibKey)) {
            bibPromises.push(
              ensureBibData(result).then(function () {
                if (result._section) {
                  appendBibFields(
                    doc,
                    result._section,
                    result,
                    result._autoCheck,
                  );
                }
              }),
            );
          }
        });

        if (bibPromises.length) {
          progressLabel.setAttribute(
            "value",
            "Pulling BibTeX for DBLP results...",
          );
          await Promise.all(bibPromises);
          progressLabel.setAttribute(
            "value",
            "Found " + results.length + " results",
          );
        }

        updateButtonState();
        searchButton.disabled = false;
      }.bind(this),
    );

    // Auto-run search once when the dialog opens.
    window.setTimeout(function () {
      searchButton.click();
    }, 0);
  },
};

var XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

function createHeading(doc, text) {
  var label = doc.createElement("label");
  label.setAttribute(
    "style",
    "font-size: 18px; font-weight: bold; margin-bottom: 8px;",
  );
  label.setAttribute("value", text);
  return label;
}

function createFieldRow(
  doc,
  key,
  value,
  withCheckbox,
  creatorData,
  initialChecked,
) {
  var row = doc.createElement("hbox");
  row.setAttribute("align", "center");
  row.setAttribute("style", "margin: 2px 0;");

  if (withCheckbox) {
    var checkbox = createXULElement(doc, "checkbox");
    checkbox.setAttribute("data-field-name", key);
    checkbox.setAttribute("data-field-value", value);
    if (creatorData) {
      checkbox.setAttribute("data-creator-data", JSON.stringify(creatorData));
    }
    if (initialChecked) {
      setCheckboxChecked(checkbox, true);
    }
    checkbox.addEventListener("command", function () {
      if (getCheckboxChecked(checkbox)) {
        var others = doc.querySelectorAll(
          'checkbox[data-field-name="' + key + '"]',
        );
        for (var i = 0; i < others.length; i++) {
          if (others[i] !== checkbox) {
            setCheckboxChecked(others[i], false);
          }
        }
      }
    });
    row.appendChild(checkbox);
  }

  var keyLabel = doc.createElement("label");
  var labelPrefix = "";
  if (withCheckbox && isDifferentFromCurrent(key, value, creatorData)) {
    labelPrefix = "*";
  }
  keyLabel.setAttribute("value", labelPrefix + key + ":");
  keyLabel.setAttribute(
    "style",
    "min-width: 120px; text-align: right; font-weight: bold; margin-right: 8px;",
  );
  row.appendChild(keyLabel);

  var valueLabel = doc.createElement("description");
  valueLabel.setAttribute("style", "flex: 1; margin: 0;");
  valueLabel.textContent = value;
  row.appendChild(valueLabel);

  return row;
}

function renderResultSection(doc, result, updateButtonState) {
  var section = doc.createElement("vbox");
  section.setAttribute("style", "margin-top: 16px;");
  result._section = section;

  var title = doc.createElement("label");
  title.setAttribute("value", result.title + " (" + result.source + ")");
  title.setAttribute("style", "font-weight: bold; font-size: 14px;");
  section.appendChild(title);

  var buttonRow = doc.createElement("hbox");
  buttonRow.setAttribute("style", "margin: 6px 0;");
  buttonRow.setAttribute("align", "center");
  buttonRow.appendChild(
    createToggleButton(doc, "Check All", section, true, updateButtonState),
  );
  buttonRow.appendChild(
    createToggleButton(doc, "Uncheck All", section, false, updateButtonState),
  );
  section.appendChild(buttonRow);

  if (result.creators.length > 0) {
    section.appendChild(
      createFieldRow(
        doc,
        "creators",
        result.creators
          .map(function (c) {
            return (c.firstName + " " + c.lastName).trim();
          })
          .join(", "),
        true,
        result.creators,
        result._autoCheck,
      ),
    );
  }

  Object.keys(result.fields).forEach(function (key) {
    section.appendChild(
      createFieldRow(
        doc,
        key,
        result.fields[key],
        true,
        undefined,
        result._autoCheck,
      ),
    );
  });

  section.addEventListener("command", updateButtonState);

  return section;
}

function createToggleButton(doc, label, section, checked, updateButtonState) {
  var button = createXULElement(doc, "button");
  button.setAttribute("label", label);
  button.setAttribute("style", "margin-right: 6px;");
  button.addEventListener("command", function () {
    var boxes = section.querySelectorAll(
      'checkbox[data-field-name]',
    );
    for (var i = 0; i < boxes.length; i++) {
      setCheckboxChecked(boxes[i], checked);
    }
    updateButtonState();
  });
  return button;
}

function createSearchOptions(doc, zotero) {
  var container = doc.createElement("hbox");
  container.setAttribute("style", "margin-top: 14px;");
  container.setAttribute("align", "center");

  var crossrefCheckbox = createXULElement(doc, "checkbox");
  crossrefCheckbox.setAttribute("label", "CrossRef.org");
  crossrefCheckbox.setAttribute("style", "margin-right: 12px;");
  setCheckboxChecked(crossrefCheckbox, getPref(zotero, "crossref-enable"));
  crossrefCheckbox.addEventListener("command", function () {
    window.setTimeout(function () {
      var checked = getCheckboxChecked(crossrefCheckbox);
      setCheckboxChecked(crossrefCheckbox, checked);
      setPref(zotero, "crossref-enable", checked);
    }, 0);
  });

  var dblpCheckbox = createXULElement(doc, "checkbox");
  dblpCheckbox.setAttribute("label", "DBLP.org");
  setCheckboxChecked(dblpCheckbox, getPref(zotero, "dblp-enable"));
  dblpCheckbox.addEventListener("command", function () {
    window.setTimeout(function () {
      var checked = getCheckboxChecked(dblpCheckbox);
      setCheckboxChecked(dblpCheckbox, checked);
      setPref(zotero, "dblp-enable", checked);
    }, 0);
  });

  container.appendChild(crossrefCheckbox);
  container.appendChild(dblpCheckbox);

  return {
    node: container,
    crossrefCheckbox: crossrefCheckbox,
    dblpCheckbox: dblpCheckbox,
  };
}

function getItemFields(item) {
  var fields = {};
  var fieldNames = item.getUsedFields(true);
  for (var i = 0; i < fieldNames.length; i++) {
    var fieldName = fieldNames[i];
    if (
      fieldName &&
      (fieldName.toLowerCase() === "abstractnote" ||
        fieldName.toLowerCase() === "url")
    ) {
      continue;
    }
    var value = item.getField(fieldName);
    if (value) {
      fields[fieldName] = String(value);
    }
  }
  return fields;
}

function isDifferentFromCurrent(key, value, creatorData) {
  if (!MetadataSearchDialog.item) {
    return false;
  }
  var currentValue = "";
  if (key === "creators") {
    var currentCreators = MetadataSearchDialog.item
      .getCreators()
      .map(function (c) {
        return (c.firstName || "") + " " + (c.lastName || "");
      })
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean)
      .join(", ");
    currentValue = currentCreators;
    if (creatorData && Array.isArray(creatorData)) {
      value = creatorData
        .map(function (c) {
          return (c.firstName + " " + c.lastName).trim();
        })
        .join(", ");
    }
  } else if (key === "itemType") {
    var typeName = MetadataSearchDialog.item.itemType;
    currentValue = typeName || "";
  } else {
    currentValue = MetadataSearchDialog.item.getField(key) || "";
  }
  return String(value || "").trim() !== String(currentValue || "").trim();
}

function getPref(zotero, key) {
  var prefKey = "extensions.zotero.metadatasearch." + key;
  try {
    var value = zotero.Prefs.get(prefKey);
    return typeof value === "boolean" ? value : true;
  } catch (e) {
    return true;
  }
}

function setPref(zotero, key, value) {
  var prefKey = "extensions.zotero.metadatasearch." + key;
  try {
    zotero.Prefs.set(prefKey, value);
  } catch (e) {}
}

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function getCheckedBoxes(container) {
  var boxes = container.querySelectorAll('checkbox[data-field-name]');
  var checked = [];
  for (var i = 0; i < boxes.length; i++) {
    if (getCheckboxChecked(boxes[i])) {
      checked.push(boxes[i]);
    }
  }
  return checked;
}

function createXULElement(doc, name) {
  return doc.createElementNS(XUL_NS, name);
}

function setCheckboxChecked(checkbox, value) {
  checkbox.checked = !!value;
  if (checkbox.checked) {
    checkbox.setAttribute("checked", "true");
  } else {
    checkbox.removeAttribute("checked");
  }
}

function getCheckboxChecked(checkbox) {
  if (typeof checkbox.checked === "boolean") {
    return checkbox.checked;
  }
  var attr = checkbox.getAttribute("checked");
  return attr === "true" || attr === "checked";
}

function titleSimilarity(title1, title2) {
  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  var s1 = normalize(title1 || "");
  var s2 = normalize(title2 || "");
  var maxLen = Math.max(s1.length, s2.length);
  var minLen = Math.min(s1.length, s2.length);
  var matches = 0;
  for (var i = 0; i < minLen; i++) {
    if (s1[i] === s2[i]) {
      matches++;
    }
  }
  if (!maxLen) {
    return 1;
  }
  return 1 - matches / maxLen;
}

function searchCrossRef(title, creators) {
  var query = (title + " " + creators.join(" ")).trim();
  var url =
    "https://api.crossref.org/works?query=" +
    encodeURIComponent(query) +
    "&rows=10";
  return getJSON(url).then(function (data) {
    var results = [];
    var fieldMapping = {
      title: "title",
      DOI: "DOI",
      publisher: "publisher",
      volume: "volume",
      issue: "issue",
      page: "pages",
      ISBN: "ISBN",
      ISSN: "ISSN",
      "container-title": "publicationTitle",
      "short-container-title": "journalAbbreviation",
      abstract: "abstractNote",
      URL: "url",
      language: "language",
    };

    var items = (data && data.message && data.message.items) || [];
    items.forEach(function (item) {
      var fields = {};
      var creatorsOut = [];

      if (item.author) {
        creatorsOut = item.author
          .map(function (a) {
            return {
              creatorType: "author",
              firstName: a.given || "",
              lastName: a.family || "",
            };
          })
          .filter(function (c) {
            return c.firstName || c.lastName;
          });
      }

      var dateParts =
        (item.published && item.published["date-parts"] && item.published["date-parts"][0]) ||
        (item["published-print"] &&
          item["published-print"]["date-parts"] &&
          item["published-print"]["date-parts"][0]) ||
        (item["published-online"] &&
          item["published-online"]["date-parts"] &&
          item["published-online"]["date-parts"][0]);
      if (dateParts) {
        fields.date = dateParts.join("-");
      }

      Object.keys(fieldMapping).forEach(function (crossrefKey) {
        var zoteroKey = fieldMapping[crossrefKey];
        if (item[crossrefKey]) {
          if (Array.isArray(item[crossrefKey]) && item[crossrefKey].length === 1) {
            fields[zoteroKey] = String(item[crossrefKey][0]);
          } else {
            fields[zoteroKey] = String(item[crossrefKey]);
          }
        }
      });

      results.push({
        source: "CrossRef",
        title: fields.title || "",
        creators: creatorsOut,
        fields: fields,
        similarity: titleSimilarity(title, fields.title || ""),
      });
    });

    return results;
  });
}

function searchDBLP(title, creators) {
  var query = (title + " " + creators.join(" ")).trim();
  var url =
    "https://dblp.org/search/publ/api?q=" +
    encodeURIComponent(query) +
    "&format=json&h=10";
  return getJSON(url).then(function (data) {
    var results = [];
    var fieldMapping = {
      title: "title",
      doi: "DOI",
      year: "date",
      venue: "publicationTitle",
      ee: "url",
      volume: "volume",
    };

    var hits =
      data &&
      data.result &&
      data.result.hits &&
      data.result.hits.hit
        ? data.result.hits.hit
        : [];

    hits.forEach(function (hit) {
      var info = hit.info || {};
      var fields = {};
      var creatorsOut = [];
      var bibUrl = null;

      if (info.authors && info.authors.author) {
        var authors = Array.isArray(info.authors.author)
          ? info.authors.author
          : [info.authors.author];
        creatorsOut = authors
          .map(function (a) {
            var fullName = a.text || a;
            var nameParts = String(fullName).split(" ");
            return {
              creatorType: "author",
              firstName: nameParts.slice(0, -1).join(" "),
              lastName: nameParts[nameParts.length - 1] || "",
            };
          })
          .filter(function (c) {
            return c.firstName || c.lastName;
          });
      }

      Object.keys(fieldMapping).forEach(function (dblpKey) {
        var zoteroKey = fieldMapping[dblpKey];
        if (info[dblpKey]) {
          fields[zoteroKey] = String(info[dblpKey]);
        }
      });

      if (info.key) {
        bibUrl = "https://dblp.org/rec/" + info.key + ".bib";
      } else if (info.url) {
        bibUrl = String(info.url) + ".bib";
      }

      results.push({
        source: "DBLP",
        title: fields.title || "",
        creators: creatorsOut,
        fields: fields,
        similarity: titleSimilarity(title, fields.title || ""),
        bibKey: info.key || "",
        bibUrl: bibUrl,
      });
    });

    return results;
  });
}

function getJSON(url) {
  if (typeof fetch === "function") {
    return fetch(url).then(function (response) {
      return response.json();
    });
  }

  if (MetadataSearchDialog.zotero && MetadataSearchDialog.zotero.HTTP) {
    return MetadataSearchDialog.zotero.HTTP.request("GET", url).then(function (response) {
      return JSON.parse(response.responseText);
    });
  }

  return Promise.reject(new Error("No HTTP client available"));
}

function saveItem(item) {
  if (typeof item.saveTx === "function") {
    return item.saveTx();
  }
  return item.save();
}

function getText(url) {
  if (typeof fetch === "function") {
    return fetch(url).then(function (response) {
      return response.text();
    });
  }
  if (MetadataSearchDialog.zotero && MetadataSearchDialog.zotero.HTTP) {
    return MetadataSearchDialog.zotero.HTTP.request("GET", url).then(
      function (response) {
        return response.responseText;
      },
    );
  }
  return Promise.reject(new Error("No HTTP client available"));
}

function ensureBibData(result) {
  if (result._bibData) {
    return Promise.resolve(result._bibData);
  }
  if (result._bibPromise) {
    return result._bibPromise;
  }
  var bibUrl = result.bibUrl;
  if (!bibUrl && result.bibKey) {
    bibUrl = "https://dblp.org/rec/" + result.bibKey + ".bib";
  }
  if (!bibUrl) {
    return Promise.resolve(null);
  }
  result._bibPromise = getText(bibUrl)
    .then(function (text) {
      var bibData = parseBibtex(text);
      result._bibData = bibData;
      return bibData;
    })
    .catch(function () {
      return null;
    });
  return result._bibPromise;
}

function appendBibFields(doc, section, result, autoCheck) {
  if (!result._bibData || result._bibAppended) {
    return;
  }
  result._bibAppended = true;

  if (result._bibData.itemType) {
    section.appendChild(
      createFieldRow(
        doc,
        "itemType",
        result._bibData.itemType,
        true,
        undefined,
        autoCheck,
      ),
    );
  }

  if (result._bibData.creators && result._bibData.creators.length) {
    section.appendChild(
      createFieldRow(
        doc,
        "creators",
        result._bibData.creators
          .map(function (c) {
            return (c.firstName + " " + c.lastName).trim();
          })
          .join(", "),
        true,
        result._bibData.creators,
        autoCheck,
      ),
    );
  }

  var fields = result._bibData.fields || {};
  Object.keys(fields).forEach(function (key) {
    section.appendChild(
      createFieldRow(doc, key, fields[key], true, undefined, autoCheck),
    );
  });
}

function parseBibtex(text) {
  var parsed = extractBibtexEntry(text);
  if (!parsed || !parsed.entry) {
    return { fields: {}, creators: [], itemType: "" };
  }
  var rawFields = parseBibtexFields(parsed.entry);
  var mapped = mapBibtexFields(rawFields, parsed.type);
  return mapped;
}

function extractBibtexEntry(text) {
  var atIndex = text.indexOf("@");
  if (atIndex === -1) {
    return null;
  }
  var typeEnd = text.indexOf("{", atIndex);
  if (typeEnd === -1) {
    return null;
  }
  var type = text.slice(atIndex + 1, typeEnd).trim().toLowerCase();
  var start = typeEnd;
  if (start === -1) {
    return null;
  }
  var depth = 0;
  for (var i = start; i < text.length; i++) {
    if (text[i] === "{") {
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        return {
          type: type,
          entry: text.slice(start + 1, i),
        };
      }
    }
  }
  return null;
}

function parseBibtexFields(entry) {
  var fields = {};
  var commaIndex = entry.indexOf(",");
  if (commaIndex === -1) {
    return fields;
  }
  var i = commaIndex + 1;
  while (i < entry.length) {
    while (i < entry.length && /\s/.test(entry[i])) {
      i++;
    }
    if (i >= entry.length) {
      break;
    }
    var nameStart = i;
    while (i < entry.length && /[\w-]/.test(entry[i])) {
      i++;
    }
    var name = entry.slice(nameStart, i).toLowerCase();
    while (i < entry.length && /\s/.test(entry[i])) {
      i++;
    }
    if (entry[i] !== "=") {
      break;
    }
    i++;
    while (i < entry.length && /\s/.test(entry[i])) {
      i++;
    }
    var value = "";
    if (entry[i] === "{") {
      var depth = 0;
      var start = i + 1;
      for (; i < entry.length; i++) {
        if (entry[i] === "{") {
          depth++;
        } else if (entry[i] === "}") {
          depth--;
          if (depth === 0) {
            value = entry.slice(start, i);
            i++;
            break;
          }
        }
      }
    } else if (entry[i] === "\"") {
      i++;
      var startQuote = i;
      for (; i < entry.length; i++) {
        if (entry[i] === "\"" && entry[i - 1] !== "\\") {
          value = entry.slice(startQuote, i);
          i++;
          break;
        }
      }
    } else {
      var startValue = i;
      while (i < entry.length && entry[i] !== ",") {
        i++;
      }
      value = entry.slice(startValue, i).trim();
    }
    if (name) {
      fields[name] = value.replace(/\s+/g, " ").trim();
    }
    while (i < entry.length && entry[i] !== ",") {
      i++;
    }
    if (entry[i] === ",") {
      i++;
    }
  }
  return fields;
}

function mapBibtexFields(rawFields, entryType) {
  var fields = {};
  var creators = [];
  var itemType = mapBibtexType(entryType);
  var mapping = {
    title: "title",
    journal: "publicationTitle",
    booktitle: "publicationTitle",
    year: "date",
    volume: "volume",
    number: "issue",
    pages: "pages",
    doi: "DOI",
    url: "url",
    isbn: "ISBN",
    issn: "ISSN",
    publisher: "publisher",
    abstract: "abstractNote",
  };

  Object.keys(mapping).forEach(function (bibKey) {
    if (rawFields[bibKey]) {
      var value = normalizeBibValue(rawFields[bibKey]);
      fields[mapping[bibKey]] = value;
    }
  });

  if (rawFields.author) {
    creators = parseAuthors(rawFields.author);
  }

  return { fields: fields, creators: creators, itemType: itemType };
}

function parseAuthors(authorField) {
  var authors = String(authorField)
    .split(/\s+and\s+/i)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  return authors.map(function (name) {
    if (name.indexOf(",") !== -1) {
      var parts = name.split(",");
      return {
        creatorType: "author",
        firstName: parts.slice(1).join(",").trim(),
        lastName: parts[0].trim(),
      };
    }
    var tokens = name.split(" ");
    return {
      creatorType: "author",
      firstName: tokens.slice(0, -1).join(" "),
      lastName: tokens[tokens.length - 1] || "",
    };
  });
}

function stripBibBraces(value) {
  return String(value || "").replace(/[{}]/g, "");
}

function normalizeBibValue(value) {
  return stripBibBraces(value).trim();
}

function mapBibtexType(entryType) {
  var type = String(entryType || "").toLowerCase();
  var mapping = {
    article: "journalArticle",
    inproceedings: "conferencePaper",
    proceedings: "conferencePaper",
    conference: "conferencePaper",
    incollection: "bookSection",
    inbook: "bookSection",
    book: "book",
    techreport: "report",
    phdthesis: "thesis",
    mastersthesis: "thesis",
  };
  return mapping[type] || "";
}

function setItemType(item, typeName) {
  if (!MetadataSearchDialog.zotero || !typeName) {
    return;
  }
  var typeID = MetadataSearchDialog.zotero.ItemTypes.getID(typeName);
  if (!typeID) {
    return;
  }
  if (typeof item.setType === "function") {
    item.setType(typeID);
  } else {
    item.itemTypeID = typeID;
  }
}
