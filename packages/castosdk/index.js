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
      serviceId: 'TESTO'
    };
    this.handshakePushable = Pushable();
    this.onHandle = this.onHandle.bind(this);
    this.startBroadCast = this.startBroadCast.bind(this);
    /* events */
    this.onNodeInitiated = undefined;
    this.onReadyToCast = undefined;
    this.onClosed = undefined;

    this.init({...defaults, ...options});
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
    this.event.addListener("onNodeInitiated", e => {
      this.onNodeInitiated && this.onNodeInitiated(e);
    });
    this.event.addListener("onReadyToCast", e => {
      this.onReadyToCast && this.onReadyToCast(e);
    });
    this.event.addListener("onClosed", e => {
      this.onClosed && this.onClosed(e);
    });
    if (!config.peerId) {
      this._node = await createNode(config.websocketStars);
    }
    this.event.emit("onNodeInitiated");
    return Promise.resolve();
  }

  async onHandle(protocol, conn) {
    let handledPeerId;
    this.pc = new RTCPeerConnection(this.config.peerConnection);
    Object.assign(this.pc, {
      "onicecandidate": event => {
        if (event.candidate) {
          this.sendStream.push({
            topic: 'sendTrickleCandidate',
            candidate: event.candidate,
          })
        }
      },
      "oniceconnectionstatechange": async event => {
        console.log('[ICE STATUS] ', this.pc.iceConnectionState)
        const connectionStates = {
          /* when sender connects to the relay */
          "connected": ()=>
            this.sendStream.push({
              topic: "updateStreamerInfo",
              profile: {},
              title: "anonymous"
            }),
          /* when viewer start to watch this broadcast */
          "completed": ()=> {
            this.event.emit("onCompleted");
          },
          "disconnected": ()=> {
            this.pc.getTransceivers().forEach(transceiver => transceiver.direction = 'inactive');
            this.pc.close();
          },
          "closed": ()=> {
            this.event.emit("onClosed");
          }
        }
        connectionStates[this.pc.iceConnectionState] &&
          connectionStates[this.pc.iceConnectionState]();
      }
    });
    // this.pc.createDataChannel("msg");

    pull(this.sendStream,
      pull.map(o => JSON.stringify(o)),
      conn,
      pull.map(o => window.JSON.parse(o.toString())),
      pull.drain(o => {
        const controllerResponse = {
          "sendCreatedAnswer": async ({sdp}) => {
            console.log('controller answered', sdp);
            await this.pc.setRemoteDescription(sdp);
          },
          "sendTrickleCandidate": ({ice}) => {
            console.log("received iceCandidate", ice);
            this.pc.addIceCandidate(ice);
          },
          "requestStreamerInfo": ({peerId}) => {
            if (this.connectedPrismPeerId) {
              this.sendStream.push({
                topic: "deniedStreamInfo",
              });
              //TODO: pull.end
              this.sendStream.end();
            } else {// isNull
              this.connectedPrismPeerId = peerId;
              this.sendStream.push({
                topic: "setupStreamInfo",
                // coords
              });
            }
          },
          'deniedSetupStreamInfo': () => {
            this.connectedPrismPeerId = null;
            //TODO: pull.end
            this.sendStream.end();
          },
          'readyToCast': () => {
            this.handledPeerId = this.connectedPrismPeerId;
            this.event.emit("onReadyToCast", this.connectedPrismPeerId);
            this.handshakePushable.push(true);
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
      // console.log('peer connected:', peerInfo.id.toB58String())
    });
    this._node.on('peer:disconnect', peerInfo => {
      if (peerInfo.id.toB58String()===this.connectedPrismPeerId) {
        console.log('peer disconnected:', peerInfo.id.toB58String());
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
    mediaStream.getTracks().forEach(track=>
      this.pc.addTransceiver(track.kind).sender.replaceTrack(track)
    );
    try {
      let offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.sendStream.push({
        topic: "sendCreatedOffer",
        sdp: this.pc.localDescription
      });
    } catch(err) {
      console.error(err);
    }
  }
  async start() {
    console.log("wait ready");
    const mediaStream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
    pull(
      this.handshakePushable,
      pull.take(1),
      pull.drain(o=>this.startBroadCast(mediaStream))
    );
    return mediaStream;
  }
}

module.exports = Casto;