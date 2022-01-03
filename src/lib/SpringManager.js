const { EventEmitter } = require("events");
const { Collection } = require("@discordjs/collection");
const fetch = require("node-fetch");
const SpringPlayer = require("./SpringPlayer");
const SpringNode = require("./SpringNode");
const SpringResponse = require("./scheme/Response");

class SpringManager extends EventEmitter {
    constructor(client, nodes, options = { }) {
        super();
        if (!client) throw new Error("Client didn't initalized either missing.");

        /**
         * Application client structure
         * @type {client}
         */
        this.client = client;
        // @private
        // eslint-disable-next-line no-underscore-dangle
        this._nodes = nodes;

        /**
         * Collections
         * @type {any}
         */
        this.nodes = new Collection();
        this.players = new Collection();
        this.voiceStates = new Collection();
        this.voiceServers = new Collection();

        /**
         * Declare default user null
         * @type {null}
         */
        this.user = null;

        /**
         * Shards of bot application
         * @type {number}
         */
        this.shards = options.shards || 1;

        /**
         * Player class object
         * @type {object}
         */
        this.player = options.player || SpringPlayer;

        /**
         * Send raw data to Discord
         * @type {any}
         */
        this.sendWS = options.sendWS;
    }

    /**
     * Build a connection with lavalink server
     * @param {any} [options]
     * @memberof SpringManager
     * @returns {object}
     */
    buildNode(options) {
        const node = new SpringNode(this, options);
        if (options.identifier) {
            this.nodes.set(options.identifier || options.host, node);
            node.connect();
            return node;
        }
        this.nodes.set(options.host, node);
        node.connect();
        return node;
    }

    /**
     * Create a connection to Discord API
     * @param {any} [data]
     * @param {any} [options]
     * @memberof SpringManager
     * @returns {void}
     */
    create(data = { }, options = { }) {
        const player = this.players.get(data.guild.id || data.guild);
        if (player) return player;
        this.sendWS({
            op: 4,
            d: {
              guild_id: data.guild.id || data.guild,
              channel_id: data.voiceChannel.id || data.voiceChannel,
              self_mute: options.selfMute || false,
              self_deaf: options.selfDeaf || false,
          },
      });
      return this.spawnPlayer(data);
    }

    /**
     * Connect bot application to lavalink
     * @param {string} [appId]
     * @memberof SpringManager
     * @returns {void}
     */
    init(appId) {
        this.user = appId;
        // eslint-disable-next-line no-underscore-dangle
       this._nodes.forEach((node) => this.buildNode(node));
    }

    /**
     * Recieve voiceServer update packets from Discord
     * @param {any} [data]
     * @memberof SpringManager
     * @returns {void}
     */
    voiceServersUpdate(data) {
        this.voiceServers.set(data.guild_id, data);
        return this.connectionProcess(data.guild_id);
    }

    /**
     * Receive voiceState update packets from Discord
     * @param {any} [data]
     * @memberof SpringManager
     * @returns {void}
     */
    voiceStateUpdate(data) {
        if (data.user_id !== this.user) return;
        if (data.channel_id) {
            this.voiceStates.set(data.guild_id, data);
            // eslint-disable-next-line consistent-return
            return this.connectionProcess(data.guild_id);
        }
        this.voiceServers.delete(data.guild_id);
        this.voiceStates.delete(data.guild_id);
    }

    /**
     * Check "VOICE_SERVER_UPDATE" and "VOICE_STATE_UPDATE" event
     * @param {any} [packet]
     * @memberof SpringManager
     * @returns {void}
     */
    packetUpdate(packet) {
        if (packet.t === "VOICE_SERVER_UPDATE") this.voiceServersUpdate(packet.d);
        if (packet.t === "VOICE_STATE_UPDATE") this.voiceStateUpdate(packet.d);
    }

    /**
     * @private
     * @param {string} [guildId]
     * @memberof SpringManager
     * @returns {boolean}
     */
    connectionProcess(guildId) {
        const server = this.voiceServers.get(guildId);
        const state = this.voiceStates.get(guildId);
        if (!server) return false;
        const player = this.players.get(guildId);
        if (!player) return false;

        player.connect({
            sessionId: state ? state.session_id : player.voiceUpdateState.sessionId,
            event: server,
        });
        return true;
    }

    /**
     * @param {none}
     * @memberof SpringManager
     * @returns {void}
     */
    get leastUsedNodes() {
        return [...this.nodes.values()]
        .filter((node) => node.connected)
        .sort((a, b) => {
            const aLoad = a.stats.cpu ? (a.stats.cpu.systemLoad / a.stats.cpu.cores) * 100 : 0;
            const bLoad = b.stats.cpu ? (b.stats.cpu.systemLoad / b.stats.cpu.cores) * 100 : 0;
            return aLoad - bLoad;
        });
    }

    /**
     * Data of players to spawn
     * @param {any} [data]
     * @memberof SpringManager
     * @returns {object}
     */
    spawnPlayer(data) {
        const guild = data.guild.id || data.guild;
        const spawnedNodes = this.nodes.get(guild);
        if (spawnedNodes) return spawnedNodes;
        if (this.leastUsedNodes.length === 0) throw new Error("No nodes are connected.");
        const node = this.nodes.get(this.leastUsedNodes[0].identifier
            || this.leastUsedNodes[0].host);
        if (!node) throw new Error("No nodes are avalible for connection.");

        // eslint-disable-next-line new-cap
        const player = new this.player(node, data, this);
        this.players.set(guild, player);

        return player;
    }

    /**
     * Request the query to lavalink
     * @param {string} [track]
     * @param {string} [source]
     * @memberof SpringManager
     * @returns {promises}
     */
    async resolveTrack(track, source) {
        const node = this.leastUsedNodes[0];
        if (!node) throw new Error("No nodes are available.");
        const regex = /^https?:\/\//;
        if (!regex.test(track)) {
            // eslint-disable-next-line no-param-reassign
            track = `${source || "yt"}search:${track}`;
        }
        const result = await this.request(node, "loadtracks", `identifier=${encodeURIComponent(track)}`);
        /**
         * Fire up on "springDebug" event
         */
        this.emit("springLogs", result);
        if (!result) throw new Error("No results found.");
        return new SpringResponse(result);
    }

    /**
     * Request to decode base64 encoded string to lavalink
     * @param {string} [track]
     * @memberof SpringManager
     * @returns {object | null}
     */
    async decodeTrack(track) {
        const node = this.leastUsedNodes[0];
        if (!node) throw new Error("No nodes are available.");
        const result = await this.request(node, "decodetrack", `track=${track}`);
        /**
         * Fire up on "springDebug" event
         */
        this.emit("springLogs", result);
        if (result.status === 500) return null;
        return result;
    }

    /**
     * @private
     * @param {object} [node]
     * @param {string} [endpoint]
     * @param {object} [param]
     * @memberof SpringManager
     * @returns {json}
     */
    // eslint-disable-next-line class-methods-use-this
    request(node, endpoint, param) {
        return fetch(`http${node.secure ? "s" : ""}://${node.host}:${node.port}/${endpoint}?${param}`, {
            headers: {
                Authorization: node.password,
            },
        })
        .then((r) => r.json())
        .catch((e) => {
            throw new Error(`Failed to request to the lavalink.\n\nLogs: ${e}`);
        });
    }

    /**
     * Get player object of a guild
     * @param {string} [guildId]
     * @memberof SpringManager
     * @returns {object}
     */
    get(guildId) {
        return this.players.get(guildId);
    }
}

module.exports = SpringManager;
