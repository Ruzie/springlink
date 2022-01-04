/* eslint-disable nonblock-statement-body-position */
/* eslint-disable curly */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-param-reassign */
const { Collection } = require("discord.js");
const { EventEmitter } = require("events");
const Queue = require("./scheme/Queue");

class SpringPlayer extends EventEmitter {
    constructor(node, options, manager) {
        super();
        /**
         * Main manager class
         * @type {manager}
         */
        this.manager = manager;

        /**
         * Lavalink node
         */
        this.node = node;

        /**
         * Send audio to Discord's specific guild by it's ID
         * @type {string}
         */
        this.guild = options.guild.id || options.guild;

        /**
         * Voice channel ID of that guild where lavalink will send audio payloads
         * @type {string}
         */
        this.voiceChannel = options.voiceChannel.id || options.voiceChannel;

        /**
         * Text channel ID of that guild where SpringLink will send event info
         * @type {string}
         */
        this.textChannel = options.textChannel || null;

        /**
         * State of lavalink node for specific guild
         * @type {state}
         */
        this.state = { volume: 100, equalizer: [] };

        /**
         * Represent is track repeat true or false
         * @type {boolean}
         */
        this.trackRepeat = false;

        /**
         * Represent is queue repeat true or false
         * @type {boolean}
         */
        this.queueRepeat = false;

        /**
         * Represent is player playing true or false
         * @type {boolean}
         */
        this.playing = false;

        /**
         * Timestamp of track
         */
        this.timestamp = null;

        /**
         * Represent is track paused true or false
         * @type {boolean}
         */
        this.paused = false;

        /**
         * Store the track here
         * @type {any}
         */
        this.track = {};

        /**
         * Check if get update to voice state
         */
        this.voiceUpdateState = null;

        /**
         * Is track or queue looped? 0 = none, 1 = track and 2 = queue
         * @type {number}
         */
        this.loop = 0;

        /**
         * Represent is track loop true or false
         * @type {boolean}
         */
        this.looped = false;

        /**
         * Position of current playing track
         * @type {number}
         */
        this.position = 0;

        /**
         * Queue of the tracks (per guild)
         * @type {any}
         */
        this.queue = new Queue();

        /**
         * @private
         * @type {number}
         */
        this.queueInc = this.queue.length / 2;

        /**
         * @private
         * Player update which send event packet
         */
        this.on("event", (data) => (this.lavalinkEvent(data).bind(this))());
        this.on("playerUpdate", (packet) => {
            this.state = {
                volume: this.state.volume,
                equalizer: this.state.equalizer,
                ...packet.state,
            };
        });
    }

    /**
     * Send play op to lavalink for starting to play the audio
     * @param {string} [track]
     * @memberof SpringPlayer
     * @returns {object}
     */
    play(track, options = { }) {
        const sound = this.queue.empty ? track : this.queue.first();
        if (!sound) return null;
        this.playing = true;
        this.track = sound;
        this.timestamp = Date.now();
        this.node.send({
            op: "play",
            guildId: this.guild,
            // eslint-disable-next-line no-plusplus
            track: Array.isArray(sound) ? sound[this.queueInc++].track : sound.track,
            volume: options.volume || 100,
        });
        return this;
    }

    /**
     * Send stop op to lavalink for stopping current track
     * (Note: It won't destrpy the player from playing if queue isn't empty)
     * @param {number} [amount]
     * @memberof SpringPlayer
     * @returns {object}
     */
    stop(amount) {
        if (typeof amount === "number" && amount > 1) {
            if (amount > this.queue.size) throw new RangeError("Cannot skip more than the queue length.");
            this.queue.splice(0, amount - 1);
        }
        this.node.send({
            op: "stop",
            guildId: this.guild,
        });
        return this;
    }

    /**
     * Send play op to lavalink for starting to play the audio
     * @param {boolean} [pause]
     * @memberof SpringPlayer
     * @returns {object}
     */
    pause(pause) {
        if (typeof pause !== "boolean") throw new RangeError("Pause function must be pass with boolean value.");
        if (this.paused || !this.queue.size) return this;
        this.playing = !pause;
        this.paused = pause;
        this.node.send({
            op: "pause",
            guildId: this.guild,
            pause,
        });
        return this;
    }

    /**
     * Send seek op to lavalink, forward either backward
     * @param {number} [position]
     * @memberof SpringPlayer
     * @returns {object}
     */
    seek(position) {
        if (Number.isNaN(position)) throw new RangeError("Position must be a number.");
        this.position = position;
        this.node.send({
            op: "seek",
            guildId: this.guild,
            position,
        });
        return this;
    }

    /**
     * Send volume op to lavalink for volume level
     * @param {number} [level]
     * @memberof SpringPlayer
     * @returns {object}
     */
    setVolume(level) {
        if (Number.isNaN(level)) throw new RangeError("Volume level must be a number.");
        this.volume = level;
        this.node.send({
            op: "volume",
            guildId: this.guild,
            volume: this.volume,
        });
        return this;
    }

    /**
     * Set track repeat, will loop the track
     * @memberof SpringPlayer
     * @returns {boolean}
     */
    setTrackRepeat() {
        this.loop = 1;
        this.looped = true;
        return this;
    }

    /**
     * Set queue repeat, will loop the queue
     * @memberof SpringPlayer
     * @returns {boolean}
     */
    setQueueRepeat() {
        this.loop = 2;
        this.looped = true;
        return this;
    }

    /**
     * Disable any loop, including track and queue loops
     * @memberof SpringPlayer
     * @returns {boolean}
     */
    disableRepeat() {
        this.loop = 0;
        this.looped = false;
        return this;
    }

    /**
     * Manually set text channel where SpringLink will emit event messages
     * @param {string} [channel]
     * @memberof SpringPlayer
     * @returns {object}
     */
    setTextChannel(channel) {
        if (typeof channel !== "string") throw new RangeError("Channel must be a string.");
        this.textChannel = channel;
        return this;
    }

    /**
     * Manually set voice channel where audio will overcome
     * @param {string} [channel]
     * @memberof SpringPlayer
     * @returns {object}
     */
    setVoiceChannel(channel) {
        if (typeof channel !== "string") throw new RangeError("Channel must be a string.");
        this.voiceChannel = channel;
        return this;
    }

    /**
     * Send equalizer op to lavalink for bands adjustment
     * @param {any | Array} [bands]
     * @memberof SpringPlayer
     * @returns {object}
     */
    setEQ(...bands) {
        if (!this.playing) throw new Error("Player isn't initalized in this guild.");
        if (bands[0] instanceof Array)
            bands = bands[0];
        if (!bands.length || !bands.every((band) => JSON.stringify(Object.keys(band).sort()) === "[\"band\",\"gain\"]")) throw new TypeError("Bands must be in an object, contains band and gain property.");
        // eslint-disable-next-line no-restricted-syntax
        for (const { band, gain } of bands) this.bands[band] = gain;
        this.node.send({
            op: "equalizer",
            guildId: this.guild,
            bands: this.bands.map((gain, band) => ({ band, gain })),
        });
        return this;
    }

    /**
     * Send equalizer op to lavalink for cLear all bands
     * @memberof SpringPlayer
     * @returns {object}
     */
    clearEQ() {
        if (!this.playing) throw new Error("Player isn't initalized in this guild.");
        this.bands = new Array(16).fill(0.0);
        this.node.send({
            op: "equalizer",
            guildId: this.guild,
            bands: this.band.map((gain, band) => ({ band, gain })),
        });
        return this;
    }

    /**
     * Send filters op to lavalink for enabling karaoke audio filter
     * @param {number} [level]
     * @param {number} [monoLevel]
     * @param {number} [filterBand]
     * @param {number} {filterWidth}
     * @memberof SpringPlayer
     * @returns {object}
     */
    setKaraoke(level, monoLevel, filterBand, filterWidth) {
        if (!this.playing) throw new Error("Player isn't initalized in this guild.");
        this.level = level;
        this.monoLevel = monoLevel;
        this.filterBand = filterBand;
        this.filterWidth = filterWidth;
        this.node.send({
            op: "filters",
            guildId: this.guild,
            karaoke: {
                level: this.level || 1.0,
                monoLevel: this.monoLevel || 1.0,
                filterBand: this.filterBand || 220.0,
                filterWidth: this.filterWidth || 100.0,
            },
        });
        return this;
    }

    /**
     * Send filters op to lavalink for enabling timescale audio filter
     * @param {number} [speed]
     * @param {number} [pitch]
     * @param {number} [rate]
     * @memberof SpringPlayer
     * @returns {object}
     */
    setTimeScale(speed, pitch, rate) {
        if (!this.playing) throw new Error("Player isn't initalized in this guild.");
        this.speed = speed;
        this.pitch = pitch;
        this.rate = rate;
        this.node.send({
            op: "filters",
            guildId: this.guild,
            timescale: {
                speed: this.speed || 1.0,
                pitch: this.pitch || 1.0,
                rate: this.rate || 1.0,
            },
        });
        return this;
    }

    /**
     * Send filters op to lavalink for enabling tremolo audio filter
     * @param {number} [freq]
     * @param {number} [depth]
     * @memberof SpringPlayer
     * @returns {object}
     */
    setTremolo(freq, depth) {
        if (!this.playing) throw new Error("Player isn't initalized in this guild.");
        this.freq = freq;
        this.depth = depth;
        this.node.send({
            op: "filters",
            guildId: this.guild,
            tremolo: {
                frequency: this.freq || 2.0,
                depth: this.depth || 0.5,
            },
        });
        return this;
    }

    /**
     * Send filters op to lavalink for enabling vibrato audio filter
     * @param {number} [freq]
     * @param {number} [depth]
     * @memberof SpringPlayer
     * @returns {object}
     */
    setVibrato(freq, depth) {
        if (!this.playing) throw new Error("Player isn't initalized in this guild.");
        this.freq = freq;
        this.depth = depth;
        this.node.send({
            op: "filters",
            guildId: this.guild,
            vibrato: {
                frequency: this.freq || 2.0,
                depth: this.depth || 0.5,
            },
        });
        return this;
    }

    /**
     * Send filters op to lavalink for enabling rotation audio filter
     * @param {number} [rotation]
     * @memberof SpringPlayer
     * @returns {object}
     */
    setRotation(rotation) {
        if (!this.playing) throw new Error("Player isn't initalized in this guild.");
        this.rotation = rotation;
        this.node.send({
            op: "filters",
            guildId: this.guild,
            rotation: {
                rotationHz: this.rotation || 0,
            },
        });
        return this;
    }

    /**
     * Send filters op to lavalink for enabling distortion audio filter
     * @param {number} [sinOffset]
     * @param {number} [sinScale]
     * @param {number} [cosOffset]
     * @param {number} [cosScale]
     * @param {number} [tanOffset]
     * @param {number} [tanScale]
     * @param {number} [offset]
     * @param {number} [scale]
     * @memberof SpringPlayer
     * @returns {object}
     */
    setDistortion(sinOffset, sinScale, cosOffset, cosScale, tanOffset, tanScale, offset, scale) {
        if (!this.playing) throw new Error("Player isn't initalized in this guild.");
        this.sinOffset = sinOffset;
        this.sinScale = sinScale;
        this.cosOffset = cosOffset;
        this.cosScale = cosScale;
        this.tanOffset = tanOffset;
        this.tanScale = tanScale;
        this.offset = offset;
        this.scale = scale;
        this.node.send({
            op: "filters",
            guildId: this.guild,
            distortion: {
                sinOffset: this.sinOffset || 0,
                sinScale: this.sinScale || 1,
                cosOffset: this.cosOffset || 0,
                cosScale: this.cosScale || 1,
                tanOffset: this.tanOffset || 0,
                tanScale: this.tanScale || 1,
                offset: this.offset || 0,
                scale: this.scale || 1,
            },
        });
        return this;
    }

    /**
     * Send filters op to lavalink for enabling channelmix audio filter
     * @param {number} [leftToLeft]
     * @param {number} [leftToRight]
     * @param {number} [rightToRight]
     * @param {number} [rightToLeft]
     * @memberof SpringPlayer
     * @returns {object}
     */
    setChannelMix(leftToLeft, leftToRight, rightToRight, rightToLeft) {
        if (!this.playing) throw new Error("Player isn't initalized in this guild.");
        this.leftToLeft = leftToLeft;
        this.leftToRight = leftToRight;
        this.rightToRight = rightToRight;
        this.rightToLeft = rightToLeft;
        this.node.send({
            op: "filters",
            guildId: this.guild,
            channelMix: {
                leftToLeft: this.leftToLeft || 1.0,
                leftToRight: this.leftToRight || 0.0,
                rightToLeft: this.rightToLeft || 0.0,
                rightToRight: this.rightToRight || 1.0,
            },
        });
        return this;
    }

    /**
     * Send filters op to lavalink for enabling lowpass audio filter
     * @param {number} [smooth]
     * @memberof SpringPlayer
     * @returns {object}
     */
    setLowPass(smooth) {
        if (!this.playing) throw new Error("Player isn't initalized in this guild.");
        this.smooth = smooth;
        this.node.send({
            op: "filters",
            guildId: this.guild,
            lowPass: {
                smoothing: this.smooth || 20.0,
            },
        });
    }

    /**
     * Send voiceUpdate op to lavalink when player is ready to play
     * @param {object} [data]
     * @returns {object}
     */
    connect(data) {
        this.voiceUpdateState = data;
        this.node.send({
            op: "voiceUpdate",
            guildId: this.guild,
            ...data,
        });
        return this;
    }

    disconnect() {
        if (this.voiceChannel === null) return null;
        this.pause(true);
        this.manager.sendWS({
            op: 4,
            d: {
                guild_id: this.guild,
                channel_id: null,
                self_mute: false,
                self_deaf: false,
            },
        });
        this.voiceChannel = null;
        return this;
    }

    /**
     * Destroy the connection with lavalink and Discord application
     * @returns {void}
     */
    destroy() {
        this.disconnect();
        this.node.send({
            op: "destroy",
            guildId: this.guild,
        });
        /**
         * Fire up when player is been distroyed
         * @event playerDestroy
         */
        this.manager.emit("playerDestroy", this);
        this.manager.players.delete(this.guild);
    }

    /**
     * Events which will be send to lavalink server
     * @param {object} [data]
     * @returns {void}
     */
    // eslint-disable-next-line class-methods-use-this
    lavalinkEvent(data) {
        const events = {
            TrackStartEvent() {
                /**
                 * Fire up when track oplaying has been started
                 * @event trackStart
                 */
                this.manager.emit("trackStart", this, this.track);
            },
            // eslint-disable-next-line consistent-return
            TrackEndEvent() {
                if (this.track && this.loop === 1) {
                    /**
                     * Fire up when track oplaying has been started
                     * @event trackStart
                     */
                    this.manager.emit("trackEnd", this, this.track);
                    return this.play();
                }
                if (this.track && this.loop === 2) {
                    /**
                     * Fire up when a track was ended
                     * @event trackEnd
                     */
                    this.manager.emit("trackEnd", this, this.track);
                    this.queue.add(this.queue.shift());
                    this.queue.shift();
                    return this.play();
                }
                if (this.queue.length <= 1) {
                    this.queue.shift();
                    this.playing = false;
                    if (["REPLACED", "FINISHED", "STOPPED"].includes(data.reason)) {
                        this.manager.emit("queueEnd", this);
                    }
                } else if (this.queue.length > 1) {
                    /**
                     * Fire up when a track was ended
                     * @event trackEnd
                     */
                    this.manager.emit("trackEnd", this, this.track);
                    return this.play();
                }
            },
            TrackStuckEvent() {
              this.queue.shift();
              /**
               * Fire up when track stuck to play
               * @event trackStuck
               */
              this.manager.emit("trackStuck", this, this.track, data);
            },
            TrackExceptionEvent() {
              this.queue.shift();
              /**
               * Fire up when there's an error while playing the track
               * @event trackError
               */
              this.manager.emit("trackError", this, this.track, data);
            },
            WebSocketClosedEvent() {
                if ([4015, 4009].includes(data.code)) {
                    this.manager.sendWS({
                        op: 4,
                        d: {
                            guild_id: data.guildId,
                            channel_id: this.voiceChannel.id || this.voiceChannel,
                            self_mute: this.options.selfMute || false,
                            self_deaf: this.options.selfDeaf || false,
                        },
                    });
                }
                /**
                 * Fire up when socket has been closed
                 * @event socketClosed
                 */
                this.manager.emit("socketClosed", this, data);
            },
            default() {
                throw new Error(`An unknown event: ${data}`);
            },
        };
        return events[data.type] || events.default;
    }
}

module.exports = SpringPlayer;
