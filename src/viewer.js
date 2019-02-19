import "@babel/polyfill";
import Casto from "@casto/sdk";

const initApp = async () => {
  window.casto = new Casto({
    type: "viewer"
  });

  let channels = {};

  Object.assign(casto, {
    onNodeInitated: e => console.log("[event] node init"),
    onReadyToCast: peerId=> console.log("[event] ready to cast", peerId),
    onClosed: ()=> document.getElementById("media").srcObject = null,
    onSendChannelsList: e => console.log("channels list", e),
    onSendChannelAdded: ({peerId, info}) => console.log("added channel", peerId, info),
    onSendChannelRemoved: e => console.log("disconnected prism", e)
  });

  new Promise(r=>casto.onSendChannelsList)
  // document.getElementById("media").srcObject = await casto.start();
};

document.addEventListener("DOMContentLoaded", initApp);