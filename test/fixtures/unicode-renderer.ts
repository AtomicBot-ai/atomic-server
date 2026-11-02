/** The same probe as runtime-compat, compiled with release flags to exercise the embedded runtime. */
import { unicodeRendererProbe } from '../helpers/unicode-renderer.js'
console.log(JSON.stringify(unicodeRendererProbe()))
