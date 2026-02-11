# Background Images

Place background images in this directory. Supported formats:
- `.jpg` / `.jpeg`
- `.png`
- `.webp`

## How It Works

1. **Automatic Discovery**: The build process automatically discovers all image files in this directory
2. **WebP Conversion**: All images are optimized and converted to WebP format during build
3. **Random Selection**: On page load, one image is randomly selected from all available images

## No Configuration Needed

Unlike the previous implementation, you don't need to update any constants. Just add images to this directory and they will be automatically included.

## Recommended Specifications

- **Format**: JPEG, PNG, or WebP
- **Resolution**: 1920x1080 or higher
- **File size**: < 2MB (will be optimized during build)
- **Aspect ratio**: 16:9 or wider for best results

## Example File Names

Any naming convention works:
- `bg1.jpg`, `bg2.jpg`, `bg3.jpg`
- `sunset.png`, `mountains.jpg`, `ocean.webp`
- `background-001.jpg`, `background-002.jpg`

The system will discover and use all supported image files automatically.
