import { chatApi } from "../lib/web-handlers.js";

export default {
  async fetch(request) {
    return chatApi(request);
  }
};
