// node --import ./scripts/register-test-loader.mjs --test ... で使う
import { register } from "node:module";

register("./test-loader.mjs", import.meta.url);
