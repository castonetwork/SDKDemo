import "@babel/polyfill";
import { Caste } from "@casto/sdk";

const initApp = async () => {
  window.casto = new Caste({
    type: "viewer"
  });

  Object.assign(casto, {
    onNodeIntiated: e => console.log("[event] node init"),
    onReadyToCast: peerId=> console.log("[event] ready to cast", peerId),
    onClosed: ()=> document.getElementById("media").srcObject = null
  });

  const startButtonElement = document.getElementById("start");
  for (;;) {
    await new Promise((resolve)=> {
      
    });
    document.getElementById("media").srcObject = await casto.start();
    startButtonElement.textContent = "stop";
  }
};

document.addEventListener("DOMContentLoaded", initApp);