const { create, Client } = require('@open-wa/wa-automate');
const fs = require('fs-extra');
const options = require('./options');
const chalk = require('chalk');
const numkk = JSON.parse(fs.readFileSync('./numbers.json'));
const NUMBER_FILE_PATH = './numbers.json';
const getContacts = require('./Contacts/index');
const moment = require('moment-timezone');
moment.tz.setDefault('America/Sao_Paulo').locale('pt-br');

// Variáveis.
let waitingForName = [];
let waitingForConfirmation = [];
let messageCount = {};
let nomes = new Map();

// Verifica se o contato já está salvo.
function searchContact(numero) {
  for (n in numkk) {
    if (numkk[n] === numero) {
      return true
    }
  }
  return false
}

// Verifica se o nome é válido, contendo apenas letras de A a Z.
function isValidName(name) {
  const regex = /^[a-zA-ZÀ-ú ]+$/;
  return regex.test(name);
}

// Verifica se o tamanho do nome completo não passa de 30 caracteres.
function isNameValidLength(name) {
  if (name.length > 30) {
    return false;
  }
  return true;
}

// Deixa a primeira letra do nome e sobrenome maiusculas, e as restantes minusculas.
function capitalize(str) {
  const words = str.trim().toLowerCase().split(' ');
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const start = async (client = new Client()) => {
  console.log('\033[2J');
  console.log(chalk.cyan("[SERVER]"), chalk.white("Servidor iniciado com sucesso!"));
  console.log(chalk.cyan("[SERVER]"), chalk.white("Servidor desenvolvido por", chalk.blue("Eduardo Mendes")));

  let numbers = [];
  try {
    numbers = await fs.readJSON(NUMBER_FILE_PATH); // Lê quantos contatos sem salvos no JSON
    console.log(chalk.cyan("[CONTATOS]"), chalk.white(`Foram carregados ${numbers.length} contatos!`));
  } catch (error) {
    console.log(chalk.red("[ERROR]"), chalk.white(`Erro ao ler arquivo ${NUMBER_FILE_PATH}!`));
  }

  // Troca de status
  client.onStateChanged((state) => {
    console.log(chalk.cyan("Status do Cliente:"), chalk.white(state));
    if (state === 'CONFLICT' || state === 'UNLAUNCHED') client.forceRefocus();
  });

  client.onMessage(async (message) => {
    const time = moment(message.t * 1000).format('DD/MM HH:mm:ss');
    if (message.from != "status@broadcast") {
      // Mensagens recebidas no WhatsApp
      console.log(chalk.cyan(`[${time}]`), chalk.green(`${message.from.replace("@c.us", "")}:`), chalk.white(message.body));
    }
    
    //Verifica se não é uma mensagem enviada em um grupo.
    if (message.isGroupMsg) return;

    // Verifica se o contato já está registrado na base de dados
    if (!searchContact(message.from)) {

     // Incrementa o número de messageCount[message.from])
     //console.log(`${message.from} tem ${messageCount[message.from]}`)
    if (message.from in messageCount) {
      messageCount[message.from]++;
    } else {
      messageCount[message.from] = 1;
    }

    // Verifica se o número de mensagens enviadas pelo usuário é maior que 15
    if (message.from in messageCount && messageCount[message.from] > 15) {
      await client.contactBlock(message.from)
      delete messageCount[message.from];
      console.log(chalk.blue("[SISTEMA]"), chalk.white(`${message.from.replace("@c.us",'')} foi bloqueado(a) por exceso de tentativas para salvar o contato!`));
      return;
    }

      // Verifica se a pessoa está aguardando para informar o nome
      if (waitingForName.includes(message.from)) {
        const name = message.body.trim();

        // Verifica se o nome informado é válido
      if (!isNameValidLength(name)  && !waitingForConfirmation.includes(message.from)) {
        await client.sendText(message.from, 'Por favor, informe um nome válido com no máximo 30 caracteres.');
      } else if (!isValidName(name)  && !waitingForConfirmation.includes(message.from)) {
        await client.sendText(message.from, 'Por favor, informe um nome válido, sem emojis, caracteres especiais ou números.');
      } else if (name.split(' ').length < 2 && !waitingForConfirmation.includes(message.from)) {
        await client.sendText(message.from, 'Por favor, informe o seu nome completo.');
      } else {

        const capitalized = capitalize(name);
       
        if (!waitingForConfirmation.includes(message.from)) { 
          // Envia uma mensagem de confirmação
          await client.sendText(message.from, `Seu nome é ${capitalized}? Responda "sim" ou "não".`);
          waitingForConfirmation.push(message.from)
          nomes.set(message.from, capitalized)
          return;
        }

      if (waitingForConfirmation.includes(message.from)) {
        const resposta = message.body.trim().toLowerCase();
        if (resposta === 'sim' || resposta === 's' || resposta === 'ss') {
          // Remove todos os listeners para que o client volte a ouvir todas as mensagens
          //client.clearChat(message.from);
          
          // Adiciona o número do contato na base de dados
          numkk.push(message.from.replace(`\"`,``));
          await fs.writeJSON('./numbers.json', numkk);

          let nome = nomes.get(message.from)

          // Envia uma mensagem de confirmação
          await client.sendText(message.from, `*${nome}*, _Seu número foi salvo com sucesso!_`);

          //Mensagem no Console
          console.log(chalk.blue("[CONTATOS]"), chalk.white(`${nome} (${message.from.replace('@c.us','')}) foi salvo com sucesso!`));

          //Salva no Google Contacts
          getContacts.chamarAuthorize(nome, message.from.substring(2).replace('@c.us', ''))

          // Remove a pessoa da lista de espera
          waitingForName = waitingForName.filter(n => n !== message.from);

          waitingForConfirmation.splice(waitingForConfirmation.indexOf(message.from), 1)

          client.clearChat(message.from);

          nomes.delete(message.from);

        } else if (resposta === 'não' || resposta === 'nao' || resposta === 'n' || resposta === 'nn') {
          client.clearChat(message.from);
          // Pergunta novamente pelo nome
          await client.sendText(message.from, 'Qual é o seu nome?');
          waitingForName.push(message.from);
          waitingForConfirmation.splice(waitingForConfirmation.indexOf(message.from), 1)
        } else {
          await client.sendText(message.from, 'Desculpe, não entendi sua resposta. Por favor, responda "sim" ou "não".');
        } 
      }
     }
      } else {
        // Se não estiver registrado, envia a primeira mensagem solicitando o nome do usuário
        await client.sendText(message.from, '👋 _Olá! Seu contato será salvo *automaticamente*, basta me falar *seu nome completo*._ 🙂'); 

        // Define a pessoa como esperando para informar o nome
        waitingForName.push(message.from);
      }
    }
  });
  
  /******   BLOQUEAR CHAMADAS   ******/
  client.onIncomingCall(async (call) => {
    console.log(chalk.red("LIGAÇÃO RECEBIDA:"), chalk.white(call));
    await client.sendText(call.peerJid, "Infelizmente eu não posso receber ligações... Seu número será bloqueado como medida protetiva!")
      .then(() => client.contactBlock(call.peerJid));
  });
};

create(options(true, start))
  .then((client) => start(client))
  .catch((error) => console.log(error));