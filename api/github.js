import { githubApi } from "../lib/web-handlers.js";

export default {
  async fetch(request) {
    return githubApi(request);
  }
};
