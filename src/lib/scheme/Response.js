const SpringTrack = require("./Track");

class SpringResponse {
  constructor(data) {
      this.tracks = data.tracks.map((track) => new SpringTrack(track));
      this.loadType = data.loadType;
      this.playlistInfo = data.playlistInfo;
    }
}

module.exports = SpringResponse;
