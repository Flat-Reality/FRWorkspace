// Reproduce the supplied recording's first and third isolated cues as 16-bit WAV.
// Usage: node scripts/cut-tracking-audio.cjs <source.wav>
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(process.argv[2]);
let format, data;
for (let pos = 12; pos + 8 <= source.length;) {
  const name = source.toString("ascii", pos, pos + 4),
    size = source.readUInt32LE(pos + 4);
  if (name === "fmt ") format = source.subarray(pos + 8, pos + 8 + size);
  if (name === "data") data = source.subarray(pos + 8, pos + 8 + size);
  pos += 8 + size + (size % 2);
}
if (
  !format ||
  !data ||
  format.readUInt16LE(0) !== 1 ||
  format.readUInt16LE(14) !== 24
)
  throw new Error("Expected original 24-bit PCM recording.");
const channels = format.readUInt16LE(2),
  rate = format.readUInt32LE(4);
const output = path.resolve(__dirname, "../public/resources/audio");
fs.mkdirSync(output, { recursive: true });
for (const [name, from, to] of [
  ["start", 0, 1.02],
  ["confirm", 2.75, 4.04],
]) {
  const first = Math.floor(from * rate),
    frames = Math.floor((to - from) * rate);
  const pcm = Buffer.alloc(frames * channels * 2);
  for (let frame = 0; frame < frames; frame++) {
    const fade = Math.min(
      1,
      (frames - frame - 1) / (rate * 0.01),
      (frame + 1) / (rate * 0.002),
    );
    for (let ch = 0; ch < channels; ch++)
      pcm.writeInt16LE(
        Math.round(
          (data.readIntLE(((first + frame) * channels + ch) * 3, 3) / 256) *
            fade,
        ),
        (frame * channels + ch) * 2,
      );
  }
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(
    path.join(output, `tracking-${name}.wav`),
    Buffer.concat([header, pcm]),
  );
  console.log(`${name}: ${from}–${to}s, ${frames / rate}s`);
}
