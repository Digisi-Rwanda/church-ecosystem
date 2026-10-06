/** Verses shown beside the sign-in form; one is picked at random per visit. */
export const SCRIPTURES = [
  {
    text: 'The Lord is my shepherd; I shall not want.',
    ref: 'Psalm 23:1',
  },
  {
    text: 'I can do all things through Christ who strengthens me.',
    ref: 'Philippians 4:13',
  },
  {
    text: 'Trust in the Lord with all your heart, and lean not on your own understanding.',
    ref: 'Proverbs 3:5',
  },
  {
    text: 'For God so loved the world that He gave His only begotten Son.',
    ref: 'John 3:16',
  },
  {
    text: 'Be still, and know that I am God.',
    ref: 'Psalm 46:10',
  },
  {
    text: 'Let us not grow weary in doing good, for in due season we shall reap.',
    ref: 'Galatians 6:9',
  },
  {
    text: 'The Lord your God is with you wherever you go.',
    ref: 'Joshua 1:9',
  },
  {
    text: 'Love one another as I have loved you.',
    ref: 'John 13:34',
  },
  {
    text: 'This is the day that the Lord has made; let us rejoice and be glad in it.',
    ref: 'Psalm 118:24',
  },
  {
    text: 'Commit your work to the Lord, and your plans will be established.',
    ref: 'Proverbs 16:3',
  },
  {
    text: 'Serve the Lord with gladness; come before His presence with singing.',
    ref: 'Psalm 100:2',
  },
  {
    text: 'And let the peace of God rule in your hearts.',
    ref: 'Colossians 3:15',
  },
];

export function pickScripture() {
  return SCRIPTURES[Math.floor(Math.random() * SCRIPTURES.length)]!;
}
