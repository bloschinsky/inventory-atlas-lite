# IS-Net model

`npm install` downloads `isnet-general-use.onnx` (170 MB) from the rembg release mirror and verifies
its pinned SHA-256 before it is used. The same step deletes any superseded model left in this
directory, such as the `u2netp.onnx` used up to 0.23.0. The model is not committed to Git, but
production builds include the verified file so background removal works without network access at
runtime.

IS-Net is the segmentation network from Highly Accurate Dichotomous Image Segmentation by Xuebin Qin
and contributors, and `isnet-general-use` is its general-purpose checkpoint. The upstream source and
model are licensed under Apache-2.0:

- <https://github.com/xuebinqin/DIS>
- <https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx>

The full license text is stored in `LICENSES/DIS-Apache-2.0.txt`.
