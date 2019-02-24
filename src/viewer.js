import "@babel/polyfill";
import Casto from "@casto/sdk";
const media = document.getElementById('media');

const initApp = async () => {
  window.casto = new Casto({
    type: "viewer"
  });

  const channelsElement = document.getElementById('channels');
  const getChannel = async (peerId, prismPeerId) => {
    console.log("getChannel", peerId);
    media.srcObject = await casto.getChannel(peerId, prismPeerId);
    console.log("mediaStream connected");
  };
  const updateChannel = ({peerId, prismPeerId, info})=> {
    let peerElement = document.getElementById(peerId);
    if (!peerElement) {
      peerElement = document.createElement('li');
      peerElement.setAttribute('id', peerId);
      const joinButton = document.createElement('button');
      joinButton.textContent = "join";
      channelsElement.appendChild(joinButton);
      channelsElement.appendChild(peerElement);
      joinButton.addEventListener('click', ()=>getChannel(peerId, prismPeerId), false);
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
    onSendChannelsList: ({channels, prismPeerId}) => {
      for (const channel in channels) {
        updateChannel({ peerId: channel, prismPeerId, info: channels[channel]});
      }
    },
    onSendChannelAdded: updateChannel,
    onSendChannelRemoved: removeChannel,
  });

};

document.addEventListener("DOMContentLoaded", initApp);