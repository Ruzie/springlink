/* eslint-disable no-underscore-dangle */
const WebSocket = require("ws");

class SpringLinkNode {
    constructor(manager, options = { }) {
        /**
         * Main manager of lavalink node
         * @type {manager}
         */
        this.manager = manager;

        /**
         * Identifier of the node using string value (optional)
         * @type {number}
         */
        this.identifier = options.identifier || null;

        /**
         * Host of the lavalink (location of lavalink server using HTTP or HTTPS)
         * Define localhost if host not specified
         * @type {string}
         */
        Object.defineProperty(this, "host", {
            value: options.host || "localhost",
        });

        /**
         * Port of lavalink server (must be open for requests, HTTP or HTTPS)
         * Define 2333 if port not specified
         * @type {number}
         */
        Object.defineProperty(this, "port", {
            value: options.port || 2333,
        });

        /**
         * Password for authenticate with lavalink, default password located at application.yaml
         * Define youshallnotpass if not specified
         * @type {string}
         */
        Object.defineProperty(this, "password", {
            value: options.password || "youshallnotpass",
        });

        /**
         * Is it secure HTTPS or WSS connection?
         * Define false if not specified
         * @type {boolean}
         */
        Object.defineProperty(this, "secure", {
            value: options.secure || false,
        });

        /**
         * WS (Websocket), setting up default to null
         */
        this.ws = null;

        /**
         * reconnctAfter, try to reconnect after a specific time
         */
        this.reconnectAfter = options.reconnectAfter || 5000;

        /**
         * Resume key of the session
         */
        this.resumeKey = options.resumeKey || null;

        /**
         * After disconnect how much later it will clear that session
         * @type {number}
         */
         Object.defineProperty(this, "_resumeTimeout", {
             value: options.resumeTimeout || 60,
             writable: true,
        });

        /**
         * Make an empty array of queue when disconnects
         * @type {any}
         */
        Object.defineProperty(this, "_queue", {
            value: [],
            writable: true,
        });

        /**
         * Status of the lavalink
         * Default value for all is 0
         */
        this.stats = {
            players: 0,
            playingPlayers: 0,
            uptime: 0,
            memory: {
                free: 0,
                used: 0,
                allocated: 0,
                reservable: 0,
            },
            cpu: {
                cores: 0,
                systemLoad: 0,
                lavalinkLoad: 0,
            },
        };

        /**
         * Set connected boolean false
         */
        this.connected = false;
    }

    /**
     * Connect the lavalink node
     * @memberof SpringLinkNode
     * @returns {void}
     */
     connect() {
         if (this.ws) this.ws.close();
         const headers = {
             Authorization: this.password,
             "Num-Shards": this.manager.shards || 1,
             "User-Id": this.manager.user,
             "Client-Name": "springlink",
        };
        if (this.resumeKey) headers["Resume-Key"] = this.resumeKey;
        this.ws = new WebSocket(`ws${this.secure ? "s" : ""}:${this.host}:${this.port}/`, { headers });
        this.ws.on("open", this._open.bind(this));
        this.ws.on("error", this._error.bind(this));
        this.ws.on("message", this._message.bind(this));
        this.ws.on("close", this._close.bind(this));
    }

    /**
     * When websocket will open the port
     * @memberof SpringLinkNode
     * @returns {void}
     */
    _open() {
        if (this._reconnect) {
            clearTimeout(this._reconnect);
            delete this._reconnect;
        }

       this._queue = [];

        if (this.resumeKey) this.send({ op: "configureResuming", key: (this.resumeKey).toString(), timeout: this._resumeTimeout });
        /**
         * Fire up when lavalink connection was successfull
         */
        this.manager.emit("nodeConnect", this);
        this.connected = true;
    }

    /**
     * On lavalink sending packets to websocket
     * @memberof SpringLinkNode
     * @param {any} [payload]
     * @returns {void}
     */
    _message(payload) {
        // eslint-disable-next-line no-param-reassign
        if (Array.isArray(payload)) payload = Buffer.concat(payload);
        // eslint-disable-next-line no-param-reassign
        else if (payload instanceof ArrayBuffer) payload = Buffer.from(payload);

        const packet = JSON.parse(payload);
        if (packet.op && packet.op === "stats") {
            this.stats = { ...packet };
            delete this.stats.op;
        }
        const player = this.manager.players.get(packet.guildId);
        if (packet.guildId && player) player.emit(packet.op, packet);

        packet.node = this;
        /**
         * Fire up when raw packets / or sending raw data
         */
        this.manager.emit("raw", packet);
    }

    /**
     * On websocket closing
     * @memberof SpringLinkNode
     * @param {any} [event]
     * @returns {void}
     */
    // eslint-disable-next-line consistent-return
    _close(event) {
        // if (!event) return "Unknown event";
        /**
         * Fire up when node disconnect
         * @event nodeClosed
         */
        this.manager.emit("nodeClose", event, this);
        if (event !== 1000) return this.reconnect();
    }

    /**
     * On websocket error
     * @memberof SpringLinkNode
     * @param {any} [event]
     * @returns {void}
     */
    _error(event) {
        if (!event) return "Unknown event";

        /**
         * Fire up when node return an error
         * @event nodeError
         */
        this.manager.emit("nodeError", event, this);
        return this.reconnect();
    }

    /**
     * On websocket reconnect
     * @memberof SpringLinkNode
     * @returns {void}
     */
    reconnect() {
        this._reconnect = setTimeout(() => {
            this.connected = false;
            this.ws.removeAllListeners();
            this.ws = null;
            this.manager.emit("nodeReconnect", this);
            this.connect();
        }, this.reconnectInterval);
    }

    /**
     * On websocket detroy or closing
     * @memberof SpringLinkNode
     * @param {string} [reason="destroy"]
     * @returns {void}
     */
    destroy(reason = "destroy") {
        this.ws.close(1000, reason);
        this.ws = null;
        this.manager.nodes.delete(this.host || this.identifier);
    }

    /**
     * Send data to websocket
     * @memberof SpringLinkNode
     * @param {any} [payload]
     * @returns {void}
     */
    send(payload) {
        const packet = JSON.stringify(payload);
        if (!this.connected) return this._queue.push(packet);
        return this._send(packet);
    }

    /**
     * Send data to websocket (private)
     * @memberof SpringLinkNode
     * @param {any} [payload]
     * @private
     * @returns {void}
     */
    _send(payload) {
        this.ws.send(payload, (error) => {
            if (error) return error;
            return null;
        });
    }
}

module.exports = SpringLinkNode;
