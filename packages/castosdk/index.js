import libp2p from "libp2p";
import EventEmitter from "./eventEmitter";
import PeerInfo from "peer-info";
import multiaddr from "multiaddr";
import WSStar from "libp2p-websocket-star";
import Mplex from "libp2p-mplex";
import pull from "pull-stream";
import Pushable from "pull-pushable";

class Node extends libp2p {
  constructor(_options) {
    const wsStar = new WSStar({id: _options.peerInfo.id});
    const defaults = {
      modules: {
        transport: [wsStar],
        streamMuxer: [Mplex],
        peerDiscovery: [wsStar.discovery]
      }
    };
    super({...defaults, ..._options});
  }
}

const createNode = async websocketStars => new Promise((resolve, reject) => {
  PeerInfo.create((err, peerInfo) => {
    if (err) reject(err);
    websocketStars.forEach(addr => peerInfo.multiaddrs.add(addr));
    const node = new Node({peerInfo});
    resolve(node);
  });
});

const setHandler = async (event, callback) => {
  if (callback) {
    this.event.addListener(event, callback);
  } else {
    return new Promise(resolve => this.event.addListener(event, resolve))
  }
};

class Casto {
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
      serviceId: 'CASTO'
    };
    this.onHandle = this.onHandle.bind(this);
    this.setup({...defaults, ...options});
  }

  async setup(config) {
    this.config = config;
    this.event = new EventEmitter();
    if (!config.peerId) {
      this._node = await createNode(config.websocketStars);
    }
    console.log("node initialized");
    this.event.emit("onNodeInitiated");
  }

  async onHandle(protocol, conn) {
    let sendStream = Pushable();
    const pc = new RTCPeerConnection(this.config.peerConnection);
    Object.assign(pc, {
      "onicecandidate": event => {
        if (event.candidate) {
          sendStream.push({
            topic: 'sendTrickleCandidate',
            candidate: event.candidate,
          })
        }
      },
      "onnegotiationneeded": async event => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('localDescription', pc.localDescription)
        sendStream.push({
          topic: 'sendCreateOffer',
          sdp: pc.localDescription,
        })
      }
    });
    pc.createDataChannel("chat");
    await new Promise(r => pc.onsignalingstatechange = () => pc.signalingState == "stable" && r());
    // transceiver = pc1.addTransceiver(trackA, {streams})

    pull(sendStream,
      pull.map(o => JSON.stringify(o)),
      conn,
      pull.map(o => window.JSON.parse(o.toString())),
      pull.drain(o => {
        const controllerResponse = {
          "sendCreatedAnswer": async ({sdp}) => {
            console.log('controller answered', sdp);
            await pc.setRemoteDescription(sdp);
          },
          "sendTrickleCandidate": ({ice}) => {
            console.log("received iceCandidate", ice);
            pc.addIceCandidate(ice);
          },
          "requestStreamerInfo": ({peerId}) => {
            if (this.connectedPrismPeerId) {
              sendStream.push({
                topic: "deniedStreamInfo",
              });
              //TODO: pull.end
              sendStream.end();
            } else {// isNull
              this.connectedPrismPeerId = peerId;
              sendStream.push({
                topic: "setupStreamInfo",
              });
            }
          },
          'deniedSetupStreamInfo': () => {
            this.connectedPrismPeerId = null;
            //TODO: pull.end
            sendStream.end();
          },
          'readyToCast': () => {
            this.event.emit("onConnected");
            console.log("this.connectedPrismPeerId : ", this.connectedPrismPeerId);
          }
        };
        controllerResponse[o.topic] && controllerResponse[o.topic](o)
      })
    );
  }

  async nodeSetup() {
    console.log(`start: ${this.config.serviceId}`, this._node);
    this._node.handle(`/streamer/${this.config.serviceId}/unified-plan`, this.onHandle);
    this._node.on('peer:connect', peerInfo => {
      console.log('peer connected:', peerInfo.id.toB58String())
    });
    this._node.on('peer:disconnect', peerInfo => {
      console.log('peer disconnected:', peerInfo.id.toB58String())
      // if (peerInfo.id.toB58String()===this.connectedPrismPeerId) {
      // }
    });
    this._node.start(err => {
      if (err) {
        console.log(err);
      } else {
        console.log("node started", this._node.peerInfo.multiaddrs.toArray().map(o => o.toString()).join("/"));
      }
    })
  }
  async start() {
    console.log("wait ready");
    await new Promise(resolve => this.event.addListener("onReady", resolve));
  }

  static async onNodeInitiated(callback) {
    return setHandler("onNodeInitiated", callback);
  }

  static async onConnected(callback) {
    return setHandler("onConnected", callback);
  }

  async broadcast(callback) {
    const mediaSource = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
    return setHandler("onBroadcasted", () => callback(mediaSource));
  }
}

module.exports = Casto;