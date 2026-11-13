/**
 * Original prayers written for Mãos em Oração (no copyrighted Bible translations are
 * quoted; only reading references). One per day, rotating through the year.
 */
export interface DailyPrayer {
  title: string;
  prayer: string;
  reflection: string;
}

export const dailyPrayers: DailyPrayer[] = [
  {
    title: 'Um novo começo',
    prayer:
      'Senhor, obrigado por este novo dia. Recebo cada hora como presente das Tuas mãos. Renova em mim a esperança, afasta o que pesa no meu coração e ensina-me a recomeçar com fé. Amém.',
    reflection: 'Para meditar hoje: Lamentações 3:22-23. Toda manhã é um convite para recomeçar.',
  },
  {
    title: 'Paz para o coração',
    prayer:
      'Pai querido, acalma o que está agitado em mim. Onde houver ansiedade, coloca a Tua paz; onde houver pressa, ensina-me a esperar. Que eu descanse sabendo que estou guardado por Ti. Amém.',
    reflection: 'Para meditar hoje: Filipenses 4:6-7. Entregue a Deus aquilo que tira o seu sono.',
  },
  {
    title: 'Pela família',
    prayer:
      'Senhor, abençoa a minha família. Protege cada pessoa que amo, cura as feridas entre nós e faz do nosso lar um lugar de perdão, cuidado e alegria. Que a Tua presença seja sentida em cada cômodo. Amém.',
    reflection: 'Para meditar hoje: Josué 24:15. O lar também é lugar de oração.',
  },
  {
    title: 'Força para o trabalho',
    prayer:
      'Deus, coloco nas Tuas mãos o trabalho de hoje. Dá-me sabedoria nas decisões, paciência com as pessoas e ânimo nas tarefas difíceis. Que o meu esforço seja honesto e frutífero. Amém.',
    reflection: 'Para meditar hoje: Colossenses 3:23. Faça tudo como quem serve com amor.',
  },
  {
    title: 'Gratidão simples',
    prayer:
      'Obrigado, Senhor, pelas pequenas coisas: o ar que respiro, o alimento, um sorriso, uma mensagem inesperada. Abre os meus olhos para enxergar Tua bondade nos detalhes deste dia. Amém.',
    reflection: 'Para meditar hoje: Salmo 103:2. Anote três motivos de gratidão antes de dormir.',
  },
  {
    title: 'Cura e cuidado',
    prayer:
      'Senhor, toca com Tua misericórdia quem está doente. Fortalece o corpo, consola a alma e sustenta quem cuida. Que ninguém se sinta sozinho na dor, porque Tu estás perto. Amém.',
    reflection:
      'Para meditar hoje: Salmo 41:3. Ligue para alguém que está passando por um momento difícil.',
  },
  {
    title: 'Direção nas escolhas',
    prayer:
      'Pai, há caminhos diante de mim e nem sempre sei qual seguir. Ilumina os meus passos, fecha as portas que não me fazem bem e abre aquelas que me aproximam de Ti. Confio na Tua direção. Amém.',
    reflection: 'Para meditar hoje: Provérbios 3:5-6. Antes de decidir, ore e escute.',
  },
  {
    title: 'Coração que perdoa',
    prayer:
      'Senhor, ensina-me a perdoar como sou perdoado. Liberta-me da mágoa que me prende ao passado e dá-me coragem para dar o primeiro passo rumo à reconciliação. Amém.',
    reflection: 'Para meditar hoje: Efésios 4:32. Perdoar também é cuidar de si.',
  },
  {
    title: 'Pelos que estão longe',
    prayer:
      'Deus de amor, abençoa quem está longe de casa e longe de mim. Guarda cada viagem, cada saudade e cada recomeço. Que a distância nunca seja maior do que o Teu cuidado. Amém.',
    reflection: 'Para meditar hoje: Salmo 121:8. Envie uma mensagem de carinho a alguém distante.',
  },
  {
    title: 'Fé nos dias difíceis',
    prayer:
      'Senhor, quando a fé ficar pequena, segura a minha mão. Mesmo sem entender tudo, escolho confiar que estás comigo e que nada foge do Teu amor. Amém.',
    reflection: 'Para meditar hoje: Isaías 41:10. Você não atravessa este dia sozinho.',
  },
  {
    title: 'Pelos filhos',
    prayer:
      'Pai, entrego a Ti a vida das crianças e dos jovens. Protege seus caminhos, guarda seus corações e dá-lhes amigos verdadeiros. Que cresçam conhecendo o Teu amor. Amém.',
    reflection:
      'Para meditar hoje: Provérbios 22:6. Abençoe hoje uma criança com palavras de incentivo.',
  },
  {
    title: 'Mansidão nas palavras',
    prayer:
      'Senhor, coloca um guarda em minha boca. Que as minhas palavras edifiquem, consolem e tragam paz. Quando eu for tentado a ferir, lembra-me da Tua mansidão. Amém.',
    reflection: 'Para meditar hoje: Tiago 1:19. Escute mais e responda com calma.',
  },
  {
    title: 'Provisão de cada dia',
    prayer:
      'Deus Provedor, Tu conheces as minhas necessidades. Dá-nos o pão de cada dia, livra-nos da preocupação excessiva e ensina-nos a partilhar com quem tem menos. Amém.',
    reflection: 'Para meditar hoje: Mateus 6:31-33. Confiança também é soltar o controle.',
  },
  {
    title: 'Descanso em Deus',
    prayer:
      'Senhor, estou cansado. Recebe o meu cansaço e renova as minhas forças. Ensina-me a parar sem culpa e a encontrar em Ti o descanso que o mundo não oferece. Amém.',
    reflection: 'Para meditar hoje: Mateus 11:28. Reserve alguns minutos de silêncio hoje.',
  },
  {
    title: 'Pelos amigos',
    prayer:
      'Obrigado, Pai, pelos amigos que colocaste no meu caminho. Abençoa cada um com saúde, alegria e fé. Faz de mim um amigo fiel, presente nas horas boas e nas difíceis. Amém.',
    reflection: 'Para meditar hoje: Provérbios 17:17. Diga a um amigo o quanto ele importa.',
  },
  {
    title: 'Esperança renovada',
    prayer:
      'Senhor, quando o futuro parecer incerto, renova a minha esperança. Que eu não desanime diante das demoras, mas aguarde com confiança o Teu tempo, que é perfeito. Amém.',
    reflection:
      'Para meditar hoje: Romanos 15:13. A esperança cresce quando é alimentada pela oração.',
  },
  {
    title: 'Humildade',
    prayer:
      'Pai, livra-me do orgulho que afasta as pessoas. Ensina-me a reconhecer meus erros, a pedir ajuda e a servir sem esperar aplauso. Que eu seja grande no amor e simples no coração. Amém.',
    reflection: 'Para meditar hoje: Miquéias 6:8. Pratique hoje um gesto discreto de serviço.',
  },
  {
    title: 'Pelos que sofrem',
    prayer:
      'Senhor, lembra-Te de quem chora hoje: os enlutados, os desempregados, os que se sentem sós. Envia consolo, ajuda concreta e pessoas generosas ao seu encontro. Usa também as minhas mãos. Amém.',
    reflection: 'Para meditar hoje: Mateus 5:4. Um gesto de cuidado pode ser resposta de oração.',
  },
  {
    title: 'Coragem',
    prayer:
      'Deus, dá-me coragem para enfrentar o que tenho evitado. Que o medo não decida por mim. Vai à minha frente e firma os meus passos naquilo que é justo. Amém.',
    reflection: 'Para meditar hoje: Josué 1:9. Coragem é seguir mesmo com o coração tremendo.',
  },
  {
    title: 'Alegria verdadeira',
    prayer:
      'Senhor, enche o meu coração de uma alegria que não depende das circunstâncias. Que eu saiba sorrir, celebrar o bem dos outros e espalhar leveza por onde passar. Amém.',
    reflection: 'Para meditar hoje: Neemias 8:10. A alegria do Senhor é força para o dia.',
  },
  {
    title: 'Pelo casamento e pelos casais',
    prayer:
      'Pai, abençoa os casais. Renova o amor gasto pela rotina, fortalece o diálogo e dá paciência nas diferenças. Que cada lar seja sustentado pelo respeito e pela fé. Amém.',
    reflection: 'Para meditar hoje: 1 Coríntios 13:4-7. O amor se prova nos pequenos cuidados.',
  },
  {
    title: 'Sabedoria',
    prayer:
      'Senhor, peço sabedoria para viver bem este dia. Ajuda-me a discernir o que é importante, a falar no momento certo e a silenciar quando for preciso. Amém.',
    reflection: 'Para meditar hoje: Tiago 1:5. Pedir sabedoria é sinal de humildade.',
  },
  {
    title: 'Pelos idosos',
    prayer:
      'Deus de todas as idades, abençoa os idosos com saúde, companhia e dignidade. Que nunca lhes falte cuidado e que sua experiência seja honrada por todos nós. Amém.',
    reflection: 'Para meditar hoje: Salmo 92:14. Visite ou ligue para alguém mais velho hoje.',
  },
  {
    title: 'Confiança no amanhã',
    prayer:
      'Pai, entrego a Ti o dia de amanhã com tudo o que ainda não sei. Que eu viva o hoje com inteireza e deixe o futuro nas Tuas mãos, que sempre cuidaram de mim. Amém.',
    reflection: 'Para meditar hoje: Mateus 6:34. Basta a cada dia o seu cuidado.',
  },
  {
    title: 'Generosidade',
    prayer:
      'Senhor, abre as minhas mãos e o meu coração. Que eu saiba repartir tempo, atenção e recursos com alegria, lembrando que tudo o que tenho veio de Ti. Amém.',
    reflection: 'Para meditar hoje: 2 Coríntios 9:7. Deus ama quem dá com alegria.',
  },
  {
    title: 'Pela nossa terra',
    prayer:
      'Deus, abençoa o nosso país e as nossas cidades. Dá sabedoria a quem governa, justiça a quem julga e paz às famílias. Que cresçam a honestidade e a solidariedade entre nós. Amém.',
    reflection: 'Para meditar hoje: 1 Timóteo 2:1-2. Orar pelo bem comum também é amor ao próximo.',
  },
  {
    title: 'Silêncio que escuta',
    prayer:
      'Senhor, no meio de tanto barulho, quero Te escutar. Aquieta os meus pensamentos e fala ao meu coração. Que eu reconheça a Tua voz nas coisas simples. Amém.',
    reflection: 'Para meditar hoje: Salmo 46:10. Experimente cinco minutos de silêncio orante.',
  },
  {
    title: 'Proteção',
    prayer:
      'Pai, cobre com Tua proteção a minha casa, os meus caminhos e as pessoas que amo. Livra-nos do mal, dos acidentes e de tudo o que rouba a paz. Somos Teus. Amém.',
    reflection: 'Para meditar hoje: Salmo 91:1-2. Descanse à sombra do cuidado de Deus.',
  },
  {
    title: 'Paciência',
    prayer:
      'Senhor, dá-me paciência comigo mesmo e com os outros. Que eu respeite o tempo de cada processo e não desista do que está sendo construído devagar. Amém.',
    reflection: 'Para meditar hoje: Gálatas 6:9. O que é plantado com fé floresce no tempo certo.',
  },
  {
    title: 'Fé que se torna gesto',
    prayer:
      'Deus, que a minha fé não fique só em palavras. Transforma minha oração em atitudes: um abraço, uma ajuda, uma visita, uma palavra de ânimo. Amém.',
    reflection: 'Para meditar hoje: Tiago 2:17. Escolha uma boa ação concreta para hoje.',
  },
  {
    title: 'Ao fim do dia',
    prayer:
      'Obrigado, Senhor, por me acompanhar até aqui. Perdoa minhas falhas, guarda o meu sono e prepara o meu coração para amanhecer com esperança. Em Tuas mãos eu descanso. Amém.',
    reflection: 'Para meditar hoje: Salmo 4:8. Termine o dia entregando tudo a Deus.',
  },
];

/** Brasília calendar day (YYYY-MM-DD) for a given instant. */
export function brasiliaDay(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Deterministic pick: the same calendar day always yields the same prayer. */
export function prayerForDay(day: string): DailyPrayer {
  const [y, m, d] = day.split('-').map(Number);
  const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  return dailyPrayers[(dayOfYear + y) % dailyPrayers.length];
}
