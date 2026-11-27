import { describe, expect, it } from 'vitest';
import { describeModelConditions, describeWeights } from './model-info';

describe('describeWeights', () => {
  it('recognises the released YOLOv8 detection weights as "not fine-tuned"', () => {
    for (const name of ['yolov8n.pt', 'yolov8s.pt', 'yolov8m.pt', 'yolov8l.pt', 'yolov8x.pt', 'YOLOv8n.pt', ' yolov8n.pt ']) {
      expect(describeWeights(name)).toEqual({ trainedOn: 'COCO', fineTuned: false });
    }
  });

  it('claims nothing for any other name', () => {
    for (const name of ['best.pt', 'yolov8n-nuscenes.pt', 'yolov8n-seg.pt', 'yolov8n.onnx', 'runs/yolov8n.pt', '']) {
      expect(describeWeights(name)).toBeNull();
    }
    expect(describeWeights(undefined)).toBeNull();
    expect(describeWeights(null)).toBeNull();
  });
});

describe('describeModelConditions', () => {
  it('lists model, training and input size from what the file states', () => {
    expect(describeModelConditions({ name: 'yolov8n', weights: 'yolov8n.pt', imageSize: 1280 })).toEqual([
      'yolov8n',
      'no fine-tuning',
      'input 1280',
    ]);
  });

  it('shows an unknown weights file by name instead of claiming how it was trained', () => {
    expect(describeModelConditions({ name: 'custom', weights: 'best.pt', imageSize: 640 })).toEqual([
      'custom',
      'weights best.pt',
      'input 640',
    ]);
  });

  it('leaves out what the file does not state', () => {
    expect(describeModelConditions({ name: 'yolov8n' })).toEqual(['yolov8n']);
    expect(describeModelConditions(undefined)).toEqual([]);
    expect(describeModelConditions(null)).toEqual([]);
  });
});
