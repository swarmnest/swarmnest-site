// Consumer AI Apps: apps a person uses directly in the browser. Kept apart from the agent tools directory
// (not in entries.json, directory.json, the search index, the API or MCP search).
export type ConsumerApp = { name: string; slug: string; category: string; url: string; description: string; checked: string };
export const CA_CATS = [
  { slug: 'image-generators', name: 'Image Generators & Editors', blurb: 'Make and edit pictures from a text prompt or a photo.' },
  { slug: 'video-generators', name: 'Video & Meme Generators', blurb: 'Turn a photo or a sentence into a short video.' },
  { slug: 'music-generators', name: 'Music & Rap Generators', blurb: 'Create songs, lyrics and rap videos.' },
  { slug: 'business-visuals', name: 'Ads & Listing Photos', blurb: 'Product ads and real estate photos for sellers.' },
  { slug: 'style-and-beauty', name: 'Style & Beauty', blurb: 'Personal color and style analysis from a selfie.' },
];
export const CA_APPS: ConsumerApp[] = [
  { name: 'Flux 2', slug: 'flux-2', category: 'image-generators', url: 'https://flux2pro.org/', description: 'Generate and edit images with FLUX, GPT Image, Nano Banana and Seedream in one workspace.', checked: '2026-11-04' },
  { name: 'Image 2', slug: 'image-2', category: 'image-generators', url: 'https://imagev2.org/', description: 'Text-to-image and image editing for posters, product shots and ads, using GPT Image 2, Nano Banana 2 and Seedream.', checked: '2026-11-04' },
  { name: 'SceneFlare', slug: 'sceneflare', category: 'image-generators', url: 'https://sceneflare.com/', description: 'Image and video studio that goes from a prompt or reference to images, motion and effects, with credit estimates before you generate.', checked: '2026-11-04' },
  { name: 'AI Image Editor', slug: 'ai-image-editor', category: 'image-generators', url: 'https://ai-img-editor.com/', description: 'Edit photos with text prompts, remove backgrounds, upscale images or generate new ones, plus short video clips.', checked: '2026-11-04' },
  { name: 'Angry Dance AI', slug: 'angry-dance-ai', category: 'video-generators', url: 'https://angrydanceai.com/', description: 'Turns one photo of a person or pet into a vertical angry dance video.', checked: '2026-11-04' },
  { name: 'Overly Attached Girlfriend', slug: 'overly-attached-girlfriend', category: 'video-generators', url: 'https://overlyattachedgirlfriend.org/', description: 'Independent AI meme video generator based on the Overly Attached Girlfriend meme.', checked: '2026-11-04' },
  { name: 'Explainer Video Generator', slug: 'explainer-video-generator', category: 'video-generators', url: 'https://explainervideogenerator.com/product-launch-video', description: 'Turns one sentence about a product into an animated launch video with script, narration, subtitles, music and cover image, exported as MP4.', checked: '2026-11-04' },
  { name: 'AI Music Generator', slug: 'ai-music-generator', category: 'music-generators', url: 'https://musicgeneratorai.io/', description: 'Creates songs, lyrics, covers, stems and music videos from a prompt.', checked: '2026-11-04' },
  { name: 'AI Rap', slug: 'ai-rap', category: 'music-generators', url: 'https://ai-rap.org/', description: 'Turns two portraits into a duet rap video, with generated lyrics and vocals.', checked: '2026-11-04' },
  { name: 'Advelum', slug: 'advelum', category: 'business-visuals', url: 'https://advelum.com/', description: 'Turns product photos or an idea into image ads and videos up to 15 seconds for your store.', checked: '2026-11-04' },
  { name: 'Curbora', slug: 'curbora', category: 'business-visuals', url: 'https://curbora.com/', description: 'AI photo editing for real estate listings, producing listing-ready media.', checked: '2026-11-04' },
  { name: 'Color Season AI', slug: 'color-season-ai', category: 'style-and-beauty', url: 'https://colorseasonai.com/', description: 'Finds your seasonal color palette from one selfie, scoring undertone, depth and chroma across 12 seasons. One free analysis a day.', checked: '2026-11-04' },
];
export const caByCat = (slug: string) => CA_APPS.filter((a) => a.category === slug).sort((a, b) => a.name.localeCompare(b.name));
