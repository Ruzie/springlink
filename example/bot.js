const { Client, Intents } = require("discord.js");
const { SpringManager } = require("../src/index");

const nodes = [
    {
        identifier: "Node 1",
        host: "localhost",
        port: 2333,
        password: "youshallnotpass",
        secure: false,
    },
];

const client = new Client({
    intents: [Object.keys(Intents.FLAGS)],
});
let played = false;
let qsize = 1;

client.manager = new SpringManager(client, nodes, {
    sendWS: (data) => {
        const guild = client.guilds.cache.get(data.d.guild_id);
        if (guild) guild.shard.send(data);
    },
});

client.manager.on("nodeConnect", (node) => {
    // eslint-disable-next-line no-console
    console.log(`${node.tag || node.host} has been connected.`);
});

client.manager.on("trackStart", (player, track) => {
    if (!played && Array.isArray(track)) {
        played = true;
        return player.textChannel.send(`Now playing \`${track[0].title}\``);
    }
    // eslint-disable-next-line no-plusplus
    return player.textChannel.send(`Now playing \`${Array.isArray(track) ? track[qsize++].title : track.title}\``);
});

client.on("ready", async (_) => {
    client.manager.init(client.user.id);
    // eslint-disable-next-line no-console
    console.log(`${client.user.username} has been online!`);
});

client.on("raw", (packet) => {
    client.manager.packetUpdate(packet);
});

// eslint-disable-next-line consistent-return
client.on("messageCreate", async (message) => {
    const prefix = "?";
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const cmd = args.shift().toLowerCase();

    if (cmd === "play") {
        if (!message.member.voice.channel) return message.channel.send({ content: "You are not on a voice channel" });

        const player = await client.manager.create({
            guild: message.guild.id,
            voiceChannel: message.member.voice.channel.id,
            textChannel: message.channel,
            selfDeaf: true,
            selfMute: false,
        });

        const resolve = await client.manager.resolveTrack(args.join(" "));

        // eslint-disable-next-line default-case
        switch (resolve.loadType) {
            case "NO_RESULTS":
                message.channel.send({ content: "There are no results found." });
            break;

            case "TRACK_LOADED":
                player.queue.add(resolve.tracks[0]);
                message.channel.send({ content: `Added: \`${resolve.tracks[0].title}\`` });
                if (!player.playing && !player.paused) return player.play();
            break;

            case "PLAYLIST_LOADED":
                player.queue.add(resolve.tracks);
                message.channel.send({ content: `Added: \`${resolve.tracks.length / 2}\`` });
                if (!player.playing && !player.paused) return player.play();
            break;

            case "SEARCH_RESULT":
                player.queue.add(resolve.tracks[0]);
                message.channel.send({ content: `Added: ${resolve.tracks[0].title}` });
                if (!player.playing) return player.play();
            break;
        }
        return null;
    }

    if (cmd === "stop") {
        const player = client.manager.get(message.guild.id);
        player.destroy();
    }

    if (cmd === "pause") {
        const player = client.manager.get(message.guild.id);
        if (!player.paused) return player.pause(true);
        return player.pause(false);
    }
    if (cmd === "skip") {
        const player = client.manager.get(message.guild.id);
        player.stop();
    }

    if (cmd === "seek") {
        if (!args[0]) return message.channel.send({ content: "Please provide a time in ms" });
        const player = client.manager.get(message.guild.id);
        if (!player.playing) return message.channel.send({ content: "Player isn't playing anything" });
        player.seek(args[0]); // Tip: For using "s", "m" parans you can use ms pakcage
    }

    if (cmd === "volume") {
        if (!args[0]) return message.channel.send({ content: "Please provide volume limit" });
        const player = client.manager.get(message.guild.id);
        player.setVolume(args[0]);
    }

    if (cmd === "timescale") {
        const player = client.manager.get(message.guild.id);
        player.setTimeScale(1.3, 1.3);
    }

    if (cmd === "size") {
        const player = client.manager.get(message.guild.id);
        message.channel.send({ content: `Queue size: ${player.queue.totalSize}` });
    }

    if (cmd === "trepeat") {
        const player = client.manager.get(message.guild.id);
        if (!player.looped) return player.setTrackRepeat();
        return player.setTrackRepeat();
    }

    if (cmd === "qrepeat") {
        const player = client.manager.get(message.guild.id);
        if (!player.looped) return player.setQueueRepeat();
        return player.setQueueRepeat();
    }

    if (cmd === "drepeat") {
        const player = client.manager.get(message.guild.id);
        if (!player.looped) return message.channel.send({ content: "Player isn't looped yet" });
        return player.disableRepeat();
    }
});

client.login("token");
