/**
 * Dynamically import all background images from /public/image/bg/
 * This uses Vite's glob import to discover images at build time.
 */

// Import all jpg, jpeg, png, webp images from the bg directory
// Note: Vite serves files from /public as /, so we use a relative path
const imageModules = import.meta.glob<string>('/image/bg/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/**
 * Get all background image URLs
 */
export function getBackgroundImages(): string[] {
  const urls = Object.values(imageModules).filter((url): url is string => typeof url === 'string')
  console.log('Found background images:', urls)
  return urls
}

/**
 * Get a random background image URL
 */
export function getRandomBackgroundImage(): string | null {
  const images = getBackgroundImages()

  if (images.length === 0) {
    console.info('No background images found in /public/image/bg/')
    return null
  }

  const randomIndex = Math.floor(Math.random() * images.length)
  return images[randomIndex]
}
