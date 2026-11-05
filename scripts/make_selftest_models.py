"""Builds the tiny ONNX models used by the in-app AI self-test (src/ai/selfTestSpec.ts).

Run: python3 scripts/make_selftest_models.py   (needs `pip install onnx==1.17.0`)
"""
import os
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "models")
os.makedirs(OUT, exist_ok=True)

# 1) y = x + conv3x3(x), conv = per-channel identity * 0.5  ->  y = 1.5 x
w = np.zeros((3, 3, 3, 3), dtype=np.float32)
for c in range(3):
    w[c, c, 1, 1] = 0.5
conv = helper.make_graph(
    [
        helper.make_node("Conv", ["input", "W"], ["c"], pads=[1, 1, 1, 1]),
        helper.make_node("Add", ["input", "c"], ["output"]),
    ],
    "selftest_conv",
    [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, "H", "W"])],
    [helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 3, "H", "W"])],
    [numpy_helper.from_array(w, "W")],
)
onnx.save(helper.make_model(conv, opset_imports=[helper.make_opsetid("", 17)]), os.path.join(OUT, "selftest_conv.onnx"))

# 2) 4-bit MatMulNBits: B packed as uint8 [N, K/block, block/2], low nibble = even k.
M, K, N, BLOCK, SCALE = 4, 64, 16, 32, 0.05
q = np.array([[(n * 7 + k * 3) % 16 for k in range(K)] for n in range(N)], dtype=np.uint8)
packed = (q[:, 0::2] | (q[:, 1::2] << 4)).reshape(N, K // BLOCK, BLOCK // 2)
scales = np.full((N * (K // BLOCK),), SCALE, dtype=np.float32)
mm = helper.make_graph(
    [helper.make_node("MatMulNBits", ["A", "B", "scales"], ["Y"], domain="com.microsoft", K=K, N=N, bits=4, block_size=BLOCK)],
    "selftest_matmul4",
    [helper.make_tensor_value_info("A", TensorProto.FLOAT, [M, K])],
    [helper.make_tensor_value_info("Y", TensorProto.FLOAT, [M, N])],
    [numpy_helper.from_array(packed, "B"), numpy_helper.from_array(scales, "scales")],
)
model = helper.make_model(mm, opset_imports=[helper.make_opsetid("", 17), helper.make_opsetid("com.microsoft", 1)])
onnx.save(model, os.path.join(OUT, "selftest_matmul4.onnx"))
print("wrote", sorted(os.listdir(OUT)))
