import React from 'react';
import { MusicPlayer } from '@/components/ui/music-player';

const MusicPlayerDemo: React.FC = () => {
  const song = {
    albumArt: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
    songTitle: 'Sunshine Mix (VIP Edit)',
    artistName: 'Lookee Stefane ft. Gomezfy Sessions',
    audioSrc: 'https://cdn.21st.dev/assets/mirror/ca/cadd2666c5571e12fafdb21697b26aef6f196a5a9c28e708129870167679991d.mp3',
  };

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-white flex items-center justify-center p-4">
      <MusicPlayer
        albumArt={song.albumArt}
        songTitle={song.songTitle}
        artistName={song.artistName}
        audioSrc={song.audioSrc}
        onNext={() => console.log('Pista siguiente')}
        onPrev={() => console.log('Pista anterior')}
      />
    </div>
  );
};

export default MusicPlayerDemo;
