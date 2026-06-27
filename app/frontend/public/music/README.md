# Music Files Directory

Add your background music files here!

## Supported Formats
- MP3 (`.mp3`) - Recommended for best browser compatibility
- OGG (`.ogg`) - Good for smaller file sizes

## Setup Instructions

1. Add your music file(s) to this directory (`app/frontend/public/music/`)
2. Name your file `background-music.mp3` (or `.ogg`)
3. Update the file path in `app/frontend/components/MusicPlayer.js` if you use a different filename

## Example
```
app/frontend/public/music/
  └── background-music.mp3
```

The music player will automatically find files at:
- `/music/background-music.mp3`
- `/music/background-music.ogg`

## File Size Recommendations
- Keep files under 5MB for faster loading
- Consider using compressed audio formats
- Loop-friendly tracks work best for background music

## Legal Note
Make sure you have the rights to use any music files you add to this project!

