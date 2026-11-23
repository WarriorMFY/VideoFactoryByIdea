# models · 可选模型

`measure.py` 的人脸指标（`face_ratio` / `face_ssim`）依赖 OpenCV Zoo 的 YuNet 模型：

```text
face_detection_yunet_2023mar.onnx
```

- 放本目录即可自动启用；**没有模型不报错**，人脸字段留空，改用人工终判。
- OpenCV 5 已移除 `CascadeClassifier`，不要回退到 Haar。
- 模型来源：OpenCV Zoo `models/face_detection_yunet/`（约 230 KB）。
