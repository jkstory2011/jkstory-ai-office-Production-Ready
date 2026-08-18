import { login } from "../lib/web-handlers.js";
import { adaptNodeToWeb } from "../lib/node-adapter.js";

export default async function handler(req, res) {
  return adaptNodeToWeb(req, res, login);
}
