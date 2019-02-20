import EventEmitter from "./eventEmitter";
import multiaddr from "multiaddr";
import pull from "pull-stream";
import Pushable from "pull-pushable";
import createNode from "./createNode";
import stringify from "pull-stringify";

class Viewer {
  constructor(options) {
    const defaults = {
      peerConnection: {
        sdpSemantics: 'unified-plan'
      },
      websocketStars: [multiaddr("/dns4/wsstar.casto.network/tcp/443/wss/p2p-websocket-star/")],
      constraint: {
        video: true,
        audio: true
      },
      serviceId: 'TESTO'
    };
    this.prisms = {};
    this.handshakePushable = Pushable();
    this.startBroadCast = this.startBroadCast.bind(this);
    /* events */
    this.onNodeInitiated = undefined;
    this.onReadyToCast = undefined;
    this.onClosed = undefined;

    this.onSendChannelsList = undefined;
    this.init({ ...defaults, ...options });
  }
  async init(options) {
    await this.setup(options);
    console.log("start to discover relays");
    this.nodeSetup();
  }
  async setup(config) {
    this.config = config;
    this.event = new EventEmitter();
    this.sendStream = Pushable()
    for (const event of [
      "onNodeInitiated",
      "onReadyToCast",
      "onClosed",
      "onSendChannelsList",
      "onSendChannelRemoved",
      "onSendChannelAdded"
    ]) {
      this.event.addListener(event, e => this[event] && this[event](e));
    }
    if (!config.peerId) {
      this._node = await createNode(config.websocketStars);
    }
    this.event.emit("onNodeInitiated");
    return Promise.resolve();
  }
  async nodeSetup() {
    console.log(`start: ${this.config.serviceId}`, this._node);
    this._node.on('peer:discovery', peerInfo => {
      const prismPeerId = peerInfo.id.toB58String();
      !this.prisms[prismPeerId] && 
        this._node.dialProtocol(peerInfo, `/controller/${this.config.serviceId}`, (err,conn)=> {
          if (err) {
            return;
          }
          const sendToPrism = Pushable();
          const mediaStream = new MediaStream();
          this.prisms[prismPeerId] = {
            isDialed: true,
            pushable: sendToPrism,
            mediaStream
          };
          pull(
            sendToPrism,
            stringify(),
            conn,
            pull.map(o => window.JSON.parse(o.toString())),
            pull.drain(event => {
              const events = {
                "sendChannelsList": ({channels})=> {
                  this.prisms[prismPeerId] = channels;
                  this.event.emit("onSendChannelsList", channels);
                },
                "updateChannelInfo": ({type, peerId, info}) => {
                  this.event.emit(type === "added" && "onSendChannelAdded", {peerId, info});
                }
              };
              console.log("[event]", event );
              events[event.topic] && events[event.topic](event);
            })
          )
          sendToPrism.push({
            topic: "registerWaveInfo",
            peerId: prismPeerId
          })
        })
    });
    this._node.on('peer:connect', peerInfo => {
      // console.log('peer connected:', peerInfo.id.toB58String())
    });
    this._node.on('peer:disconnect', peerInfo => {
      const peerId = peerInfo.id.toB58String();
      if (this.prisms[peerId]) {
        for (const flowId in this.prisms[peerId]) {
          this.event.emit("onSendChannelRemoved", flowId);
        }
        delete this.prisms[peerId];
      }
    });
    this._node.start(err => {
      if (err) {
        console.log(err);
      } else {
        console.log("node started", this._node.peerInfo.multiaddrs.toArray().map(o => o.toString()).join("/"));
      }
    })
  }
  async startBroadCast(mediaStream) {
    console.log('ready to sir, my lord');
    console.log(mediaStream);
    mediaStream.getTracks().forEach(track =>
      this.pc.addTransceiver(track.kind).sender.replaceTrack(track)
    );
    try {
      let offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.sendStream.push({
        topic: "sendCreatedOffer",
        sdp: this.pc.localDescription
      });
    } catch (err) {
      console.error(err);
    }
  }
  async start() {
    console.log("wait ready");
    const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    pull(
      this.handshakePushable,
      pull.take(1),
      pull.drain(o => this.startBroadCast(mediaStream))
    );
    return mediaStream;
  }  
}

module.exports = Viewer