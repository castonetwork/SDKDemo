import "@babel/polyfill";
import Casto from "@casto/sdk";

const initApp = async () => {
  const casto = new Casto({
    type: "sender"
  });
  // casto.start();
  // await casto.onConnected();
  const connectionStatusElement = document.querySelector("#connectionStatus>span");
  connectionStatusElement.classList.remove("connecting");
  connectionStatusElement.classList.add("connected");

  await new Promise((resolve)=>
    document.forms['broadcastForm'].addEventListener("submit", e=> {
      e.preventDefault();
      resolve();
    }));
  // const mediaStream = await casto.broadcast();
  document.getElementById("media").srcObject = await casto.start();

  const startButtonElement = document.getElementById("start");
  startButtonElement.textContent = "stop";
};

document.addEventListener("DOMContentLoaded", initApp);


