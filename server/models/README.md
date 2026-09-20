# U2NetP model

`npm install` downloads `u2netp.onnx` from the rembg release mirror and verifies its pinned SHA-256
before it is used. The model is not committed to Git, but production builds include the verified
file so background removal works without network access at runtime.

U2NetP is the lightweight form of U²-Net by Xuebin Qin and contributors. The upstream source and
model are licensed under Apache-2.0:

- <https://github.com/xuebinqin/U-2-Net>
- <https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx>

The full license text is stored in `LICENSES/U-2-Net-Apache-2.0.txt`.
