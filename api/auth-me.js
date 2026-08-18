import { me } from "../lib/web-handlers.js";

export default {
  async fetch(request) {
    return me(request);
  }
};
