import "@babel/polyfill";
import Casto from "@casto/sdk";

const initApp = async () => {
  window.casto = new Casto({
    type: "sender"
  });

  Object.assign(casto, {
    onNodeIntiated: e => console.log("[event] node init"),
    onReadyToCast: peerId=> console.log("[event] ready to cast", peerId)
  });

  await new Promise((resolve)=>
    document.forms['broadcastForm'].addEventListener("submit", e=> {
      e.preventDefault();
      resolve();
    }));

  document.getElementById("media").srcObject = await casto.start();

  const startButtonElement = document.getElementById("start");
  startButtonElement.textContent = "stop";
};

document.addEventListener("DOMContentLoaded", initApp);