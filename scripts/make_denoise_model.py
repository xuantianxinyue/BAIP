#!/usr/bin/env python3
"""Builds public/models/denoise.onnx from the official Real-ESRGAN weights.

Usage: make_denoise_model.py <realesr-general-x4v3.pth> [out.onnx]
Needs: pip install torch onnx==1.17.0
Weights: https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth (BSD-3-Clause)

SRVGGNetCompact: 64 features, 32 convs, PReLU, pixel-shuffle x4 plus a nearest-neighbour skip. The
graph is written by hand so the result does not depend on an exporter version. Weights stay fp32:
ONNX Runtime's 4-bit path (MatMulNBits) only exists for MatMul, and the net is only 4.8 MB anyway.
"""
import sys
from pathlib import Path

import numpy as np
import onnx
import torch
from onnx import TensorProto, helper, numpy_helper

NUM_CONV = 32
SCALE = 4


def load(path: Path) -> dict:
    state = torch.load(path, map_location='cpu', weights_only=True)  # no pickle code execution
    state = state.get('params_ema', state.get('params', state))
    return {k: v.numpy().astype(np.float32) for k, v in state.items()}


def build(state: dict) -> onnx.ModelProto:
    inits, nodes = [], []

    def param(name, value):
        inits.append(numpy_helper.from_array(np.ascontiguousarray(value, dtype=np.float32), name))
        return name

    x = 'input'
    last = 2 * NUM_CONV + 2  # body.<last> is the tail conv
    for index in range(0, last + 1, 2):
        w, b = state[f'body.{index}.weight'], state[f'body.{index}.bias']
        y = f'conv{index}'
        nodes.append(helper.make_node('Conv', [x, param(f'w{index}', w), param(f'b{index}', b)], [y], kernel_shape=[3, 3], pads=[1, 1, 1, 1]))
        x = y
        if index < last:
            y = f'act{index}'
            nodes.append(helper.make_node('PRelu', [x, param(f'a{index}', state[f'body.{index + 1}.weight'].reshape(-1, 1, 1))], [y]))
            x = y

    nodes.append(helper.make_node('DepthToSpace', [x], ['tail'], blocksize=SCALE, mode='CRD'))
    scales = param('resize_scales', np.array([1, 1, SCALE, SCALE]))
    nodes.append(helper.make_node('Resize', ['input', '', scales], ['base'], mode='nearest', nearest_mode='floor', coordinate_transformation_mode='asymmetric'))
    nodes.append(helper.make_node('Add', ['tail', 'base'], ['output']))

    graph = helper.make_graph(
        nodes,
        'denoise',
        [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, 'h', 'w'])],
        [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, 'oh', 'ow'])],
        inits,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 17)], ir_version=8)
    onnx.checker.check_model(model)
    return model


def main() -> None:
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent.parent / 'public' / 'models' / 'denoise.onnx'
    onnx.save(build(load(Path(sys.argv[1]))), out)
    print(out, out.stat().st_size)


if __name__ == '__main__':
    main()
