#!/usr/bin/env python3
"""Extract selected cells from a transparent sprite grid into a Phaser atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-image", required=True)
    parser.add_argument(
        "--output-json",
        help="Optional Phaser atlas JSON. Omit for a tightly packed spritesheet.",
    )
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--select", required=True, help="Comma-separated zero-based cell indices")
    parser.add_argument("--frame-width", type=int, required=True)
    parser.add_argument("--frame-height", type=int, required=True)
    parser.add_argument("--frame-prefix", required=True)
    parser.add_argument("--padding", type=int, default=2)
    parser.add_argument("--content-padding", type=int, default=6)
    parser.add_argument("--alpha-threshold", type=int, default=8)
    parser.add_argument(
        "--flip-horizontal",
        action="store_true",
        help="Mirror every selected source cell before normalization.",
    )
    return parser.parse_args()


def alpha_bbox(image: Image.Image, threshold: int) -> tuple[int, int, int, int] | None:
    mask = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
    return mask.getbbox()


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGBA")
    if source.width % args.columns or source.height % args.rows:
        raise SystemExit("Source dimensions must divide evenly into the requested grid.")

    cell_width = source.width // args.columns
    cell_height = source.height // args.rows
    selected = [int(value.strip()) for value in args.select.split(",") if value.strip()]
    if not selected:
        raise SystemExit("At least one cell must be selected.")

    cropped: list[Image.Image] = []
    for index in selected:
        if index < 0 or index >= args.columns * args.rows:
            raise SystemExit(f"Cell index {index} is outside the source grid.")
        column = index % args.columns
        row = index // args.columns
        cell = source.crop((
            column * cell_width,
            row * cell_height,
            (column + 1) * cell_width,
            (row + 1) * cell_height,
        ))
        bbox = alpha_bbox(cell, args.alpha_threshold)
        if bbox is None:
            raise SystemExit(f"No visible pixels found in cell {index}.")
        content = cell.crop(bbox)
        if args.flip_horizontal:
            content = content.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        cropped.append(content)

    max_width = max(frame.width for frame in cropped)
    max_height = max(frame.height for frame in cropped)
    usable_width = args.frame_width - args.content_padding * 2
    usable_height = args.frame_height - args.content_padding * 2
    scale = min(usable_width / max_width, usable_height / max_height)

    atlas_width = args.padding + len(cropped) * (args.frame_width + args.padding)
    atlas_height = args.frame_height + args.padding * 2
    atlas = Image.new("RGBA", (atlas_width, atlas_height), (0, 0, 0, 0))
    frames: dict[str, dict[str, object]] = {}

    for output_index, frame in enumerate(cropped, start=1):
        resized_width = max(1, round(frame.width * scale))
        resized_height = max(1, round(frame.height * scale))
        resized = frame.resize((resized_width, resized_height), Image.Resampling.LANCZOS)
        frame_canvas = Image.new("RGBA", (args.frame_width, args.frame_height), (0, 0, 0, 0))
        offset_x = (args.frame_width - resized_width) // 2
        offset_y = args.frame_height - args.content_padding - resized_height
        frame_canvas.alpha_composite(resized, (offset_x, offset_y))

        atlas_x = args.padding + (output_index - 1) * (args.frame_width + args.padding)
        atlas_y = args.padding
        atlas.alpha_composite(frame_canvas, (atlas_x, atlas_y))
        name = f"{args.frame_prefix}_{output_index}"
        frame_rect = {"x": atlas_x, "y": atlas_y, "w": args.frame_width, "h": args.frame_height}
        frames[name] = {
            "frame": frame_rect,
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": args.frame_width, "h": args.frame_height},
            "sourceSize": {"w": args.frame_width, "h": args.frame_height},
        }

    output_image = Path(args.output_image)
    output_image.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output_image, "WEBP", lossless=True, method=6)
    if args.output_json:
        output_json = Path(args.output_json)
        output_json.parent.mkdir(parents=True, exist_ok=True)
        metadata = {
            "frames": frames,
            "meta": {
                "app": "Horde Breaker sprite grid packer",
                "version": "1.0",
                "image": output_image.name,
                "format": "RGBA8888",
                "size": {"w": atlas_width, "h": atlas_height},
                "scale": "1",
            },
        }
        output_json.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    print(
        f"packed {len(cropped)} frames from {cell_width}x{cell_height} cells "
        f"into {atlas_width}x{atlas_height} atlas at shared scale {scale:.4f}"
    )


if __name__ == "__main__":
    main()
