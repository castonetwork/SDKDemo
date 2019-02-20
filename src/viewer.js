import "@babel/polyfill";
import Casto from "@casto/sdk";
const media = document.getElementById('media');

const initApp = async () => {
  window.casto = new Casto({
    type: "viewer"
  });

  const channelsElement = document.getElementById('channels');
  const getChannel = async peerId => {
    console.log("getChannel", peerId);
    media.srcObject = await Casto.getChannel(peerId);
  };
  const updateChannel = ({peerId, info})=> {
    let peerElement = document.getElementById(peerId);
    if (!peerElement) {
      peerElement = document.createElement('li');
      peerElement.setAttribute('id', peerId);
      channelsElement.appendChild(peerElement);
      channelsElement.addEventListener('click', ()=>getChannel(peerId), false);
    }
    peerElement.textContent = `${info.title}: ${peerId}`;
  };
  const removeChannel = peerId => {
    document.getElementById(peerId).remove();
  };
  Object.assign(casto, {
    onNodeInitated: e => console.log("[event] node init"),
    onReadyToCast: peerId=> console.log("[event] ready to cast", peerId),
    onClosed: ()=> document.getElementById("media").srcObject = null,
    onSendChannelsList: channels => {
      for (const channel in channels) {
        updateChannel({ peerId: channel, info: channels[channel]});
      }
    },
    onSendChannelAdded: updateChannel,
    onSendChannelRemoved: removeChannel,
  });

};

document.addEventListener("DOMContentLoaded", initApp);