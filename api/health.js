import { health } from "../lib/web-handlers.js";

export default {
  async fetch(request) {
    return health(request);
  }
};
