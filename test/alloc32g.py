import mmap

SIZE = 32 * 1024 * 1024 * 1024  # 32 GiB

buf = mmap.mmap(-1, SIZE, flags=mmap.MAP_PRIVATE | mmap.MAP_ANONYMOUS,
                prot=mmap.PROT_READ | mmap.PROT_WRITE)

# Touch every page (4 KiB stride) to force physical allocation
PAGE = 4096
for offset in range(0, SIZE, PAGE):
    buf[offset] = 0xFF

print(f"Allocated and touched {SIZE / (1024**3):.0f} GiB")
buf.close()
