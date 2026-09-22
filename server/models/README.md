# IS-Net model

`npm install` downloads `isnet-general-use-dynamic.onnx` (168 MB) and verifies its pinned SHA-256
before it is used. The same step deletes any superseded model left in this directory, such as the
`u2netp.onnx` used up to 0.23.0 and the fixed-size `isnet-general-use.onnx` used in 0.24.0. The model
is not committed to Git, but production builds include the verified file so background removal works
without network access at runtime.

IS-Net is the segmentation network from Highly Accurate Dichotomous Image Segmentation by Xuebin Qin
and contributors, and `isnet-general-use` is its general-purpose checkpoint. The upstream source and
model are licensed under Apache-2.0:

- <https://github.com/xuebinqin/DIS>

## Why not the rembg mirror

The obvious artifact is the rembg release mirror's `isnet-general-use.onnx`, which 0.24.0 used. That
export bakes `1024x1024` into the declared shape of every node, so `onnxruntime` refuses to load it
for any other input size, and the application has to pay for 1024x1024 inference. This project
therefore pins an ONNX re-export with dynamic spatial axes:

- <https://huggingface.co/SacredNoir/isnet-general-use-onnx>, revision
  `ff56cb825ee2637d4726f8a739fb7bf1bf4bea04`, declared Apache-2.0.

It is the same checkpoint, not a different model: run against the regression photo at 1024x1024, the
two exports produce masks that differ by at most 3e-6. The download URL pins that revision and the
file is still accepted only when its SHA-256 matches, so neither the branch moving nor the account
changing can alter what gets installed.

The full license text is stored in `LICENSES/DIS-Apache-2.0.txt`.
