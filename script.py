from PIL import Image, ImageSequence
import sys
from pathlib import Path


def reverse_gif(src: Path) -> None:
    dest = src.with_stem(src.stem + "_R")

    img = Image.open(src)

    frames: list[Image.Image] = []
    delays: list[int] = []

    for frame in ImageSequence.Iterator(img):
        frames.append(frame.copy())
        delays.append(frame.info.get("duration", 100))

    reversed_frames = [frames[0]] + list(reversed(frames[1:]))
    reversed_delays = [delays[0]] + list(reversed(delays[1:]))

    reversed_delays[1], reversed_delays[-1] = reversed_delays[-1], reversed_delays[1]

    reversed_frames[0].save(
        dest,
        save_all=True,
        append_images=reversed_frames[1:],
        loop=0,
        duration=reversed_delays,
        disposal=2,
    )


def double_end_delay(src: Path) -> None:
    img = Image.open(src)

    frames: list[Image.Image] = []
    delays: list[int] = []

    for frame in ImageSequence.Iterator(img):
        frames.append(frame.copy())
        delays.append(frame.info.get("duration", 100))

    delays[-1] //= 2

    frames[0].save(
        src,
        save_all=True,
        append_images=frames[1:],
        loop=0,
        duration=delays,
        disposal=2,
    )


# if __name__ == "__main__":
#     directory = Path(sys.argv[1])
#     for path in directory.iterdir():
#         if path.suffix.lower() == ".gif":
#             print(f"Processing {path.name}")
#             # reverse_gif(path)
#             double_end_delay(path)

if __name__ == "__main__":
    directory = Path(sys.argv[1])
    max_width = 0
    max_height = 0
    name_width = ""
    name_height = ""

    for path in directory.iterdir():
        if path.suffix.lower() == ".gif":
            img = Image.open(path)
            if img.width > max_width:
                name_width = path
            if img.height > max_height:
                name_height = path
            max_width = max(max_width, img.width)
            max_height = max(max_height, img.height)

    print(f"{max_width}x{max_height}: {name_width}x{name_height}")
