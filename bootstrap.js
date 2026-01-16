"use strict";

var { Services } = Components.utils.import(
  "resource://gre/modules/Services.jsm",
  {},
);

var MENU_ITEM_ID = "metadatasearch-z6-itemmenu";
var MENU_PARENT_IDS = ["zotero-itemmenu", "zotero-itemmenu-popup"];
var MENU_LABEL = "Metadata Search";

var windowListener = {
  onOpenWindow: function (aWindow) {
    var win = aWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
      .getInterface(Components.interfaces.nsIDOMWindow);
    win.addEventListener(
      "load",
      function onLoad() {
        win.removeEventListener("load", onLoad, false);
        loadIntoWindow(win);
      },
      false,
    );
  },
  onCloseWindow: function (aWindow) {},
  onWindowTitleChange: function (aWindow, aTitle) {},
};

function install(data, reason) {}

function startup(data, reason) {
  let enumerator = Services.wm.getEnumerator(null);
  while (enumerator.hasMoreElements()) {
    let win = enumerator.getNext();
    loadIntoWindow(win);
  }
  Services.wm.addListener(windowListener);
}

function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }
  Services.wm.removeListener(windowListener);
  let enumerator = Services.wm.getEnumerator(null);
  while (enumerator.hasMoreElements()) {
    let win = enumerator.getNext();
    unloadFromWindow(win);
  }
}

function uninstall(data, reason) {}

function loadIntoWindow(win) {
  if (!isZoteroWindow(win)) {
    return;
  }
  let doc = win.document;
  if (doc.readyState !== "complete") {
    win.addEventListener(
      "load",
      function onLoad() {
        win.removeEventListener("load", onLoad, false);
        addMenuItem(win);
      },
      false,
    );
    return;
  }
  addMenuItem(win);
}

function unloadFromWindow(win) {
  if (!isZoteroWindow(win)) {
    return;
  }
  removeMenuItem(win);
}

function isZoteroWindow(win) {
  return win && win.ZoteroPane && win.document;
}

function addMenuItem(win) {
  let doc = win.document;
  let menu = null;
  for (let i = 0; i < MENU_PARENT_IDS.length; i++) {
    menu = doc.getElementById(MENU_PARENT_IDS[i]);
    if (menu) {
      break;
    }
  }
  if (!menu || doc.getElementById(MENU_ITEM_ID)) {
    return;
  }

  let menuItem = doc.createElement("menuitem");
  menuItem.id = MENU_ITEM_ID;
  menuItem.setAttribute("label", MENU_LABEL);
  menuItem.addEventListener("command", function () {
    openDialog(win);
  });

  let onShowing = function () {
    let items = win.ZoteroPane.getSelectedItems();
    let hasRegular = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i] && items[i].isRegularItem && items[i].isRegularItem()) {
        hasRegular = true;
        break;
      }
    }
    menuItem.disabled = !hasRegular;
  };

  menu.addEventListener("popupshowing", onShowing, false);
  menu.appendChild(menuItem);

  win.__metadatasearchMenu = {
    menu: menu,
    menuItem: menuItem,
    onShowing: onShowing,
  };
}

function removeMenuItem(win) {
  let data = win.__metadatasearchMenu;
  if (!data) {
    return;
  }
  try {
    data.menu.removeEventListener("popupshowing", data.onShowing, false);
    if (data.menuItem && data.menuItem.parentNode) {
      data.menuItem.parentNode.removeChild(data.menuItem);
    }
  } finally {
    delete win.__metadatasearchMenu;
  }
}

function openDialog(win) {
  let items = win.ZoteroPane.getSelectedItems();
  let targetItem = null;
  for (let i = 0; i < items.length; i++) {
    if (items[i] && items[i].isRegularItem && items[i].isRegularItem()) {
      targetItem = items[i];
      break;
    }
  }
  if (!targetItem) {
    return;
  }

  win.openDialog(
    "chrome://metadatasearch/content/dialog.xul",
    "metadatasearch",
    "chrome,centerscreen,resizable",
    {
      itemID: targetItem.id,
      Zotero: win.Zotero,
    },
  );
}
