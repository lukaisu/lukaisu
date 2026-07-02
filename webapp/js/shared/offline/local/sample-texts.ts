/**
 * Built-in starter texts for offline-first setup.
 *
 * Pure data module: no project imports. Every entry is either an
 * unambiguously public-domain classic (pre-1900) or original beginner
 * sentences written for this project. The `languageName` of each text matches
 * a `LanguagePreset.name` so it can be linked to the seeded language.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/**
 * A single built-in starter text.
 */
export interface SampleText {
  /** Matches a LanguagePreset.name so it can be linked to the seeded language. */
  languageName: string;
  title: string;
  /** Plain UTF-8 text body (paragraphs separated by \n). */
  text: string;
  /** Public-domain source attribution, or '' . */
  sourceUri: string;
}

/**
 * Short, beginner-friendly starter texts: public-domain fables and original
 * example sentences. Kept deliberately brief (roughly 80-150 words each).
 */
export const SAMPLE_TEXTS: SampleText[] = [
  {
    languageName: 'English',
    title: 'The Fox and the Grapes',
    text:
      'A hungry Fox saw some fine bunches of Grapes hanging from a vine ' +
      'that was trained along a high trellis, and did his best to reach ' +
      'them by jumping as high as he could into the air. But it was all ' +
      'in vain, for they were just out of reach. So he gave up trying, ' +
      'and walked away with an air of dignity and unconcern, remarking, ' +
      '"I thought those Grapes were ripe, but I see now they are quite ' +
      'sour."\n' +
      'It is easy to despise what you cannot get.',
    sourceUri: 'https://www.gutenberg.org/ebooks/11339'
  },
  {
    languageName: 'English',
    title: 'The Tortoise and the Hare',
    text:
      'A Hare was making fun of the Tortoise one day for being so slow.\n' +
      '"Do you ever get anywhere?" he asked with a mocking laugh.\n' +
      '"Yes," replied the Tortoise, "and I get there sooner than you ' +
      'think. I will run you a race and prove it."\n' +
      'The Hare was much amused at the idea of running a race with the ' +
      'Tortoise, but for the fun of the thing he agreed. So the Fox, who ' +
      'had consented to act as judge, marked the distance and started the ' +
      'runners off.\n' +
      'Slow but steady wins the race.',
    sourceUri: 'https://www.gutenberg.org/ebooks/19994'
  },
  {
    languageName: 'French',
    title: 'Salutations et vie quotidienne',
    text:
      'Bonjour ! Comment allez-vous aujourd\'hui ?\n' +
      'Je vais très bien, merci. Et vous ?\n' +
      'Moi aussi, ça va. Quel est votre nom ?\n' +
      'Je m\'appelle Marie. J\'habite à Paris.\n' +
      'Le matin, je bois un café et je mange du pain.\n' +
      'Ensuite, je vais au travail à pied.\n' +
      'Le soir, je lis un livre et j\'écoute de la musique.\n' +
      'Au revoir et à bientôt !',
    sourceUri: ''
  },
  {
    languageName: 'German',
    title: 'Begrüßung und Alltag',
    text:
      'Guten Tag! Wie geht es Ihnen?\n' +
      'Es geht mir gut, danke. Und Ihnen?\n' +
      'Mir geht es auch gut. Wie heißen Sie?\n' +
      'Ich heiße Anna. Ich wohne in Berlin.\n' +
      'Am Morgen trinke ich Kaffee und esse Brot.\n' +
      'Danach gehe ich zur Arbeit.\n' +
      'Am Abend lese ich ein Buch und höre Musik.\n' +
      'Auf Wiedersehen und bis bald!',
    sourceUri: ''
  },
  {
    languageName: 'Spanish',
    title: 'Saludos y vida diaria',
    text:
      '¡Hola! ¿Cómo estás hoy?\n' +
      'Estoy muy bien, gracias. ¿Y tú?\n' +
      'Yo también estoy bien. ¿Cómo te llamas?\n' +
      'Me llamo Carlos. Vivo en Madrid.\n' +
      'Por la mañana bebo café y como pan.\n' +
      'Después voy al trabajo.\n' +
      'Por la noche leo un libro y escucho música.\n' +
      '¡Adiós y hasta pronto!',
    sourceUri: ''
  },
  {
    languageName: 'Chinese',
    title: '简单的句子',
    text:
      '你好！我叫王明。\n' +
      '我住在北京。\n' +
      '早上我喝茶，吃面包。\n' +
      '然后我去上班。\n' +
      '晚上我看书，听音乐。\n' +
      '今天天气很好。\n' +
      '再见！',
    sourceUri: ''
  },
  {
    languageName: 'Japanese',
    title: 'やさしい文',
    text:
      'こんにちは。わたしは田中です。\n' +
      'わたしは東京に住んでいます。\n' +
      '朝はお茶を飲んで、パンを食べます。\n' +
      'それから仕事に行きます。\n' +
      '夜は本を読んで、音楽を聞きます。\n' +
      '今日はいい天気です。\n' +
      'さようなら。',
    sourceUri: ''
  }
];
