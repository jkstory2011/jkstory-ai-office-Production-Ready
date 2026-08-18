import { messageApi } from "../lib/web-handlers.js";

export default {
  async fetch(request) {
    return messageApi(request);
  }
};
