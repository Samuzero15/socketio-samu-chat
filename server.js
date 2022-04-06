const http = require('http'); // Para la generacion del servidor
const express = require('express'); // Express como framework
const { Server: SocketIO } = require('socket.io'); // Socket.IO para manejar los sockets
const path = require('path'); // Ayudante de rutas
var siofu = require("socketio-file-upload"); // Paquete de NPM para el envio de archivos con socketio
const fs = require('fs'); // Manejaremos archivos, usaremos la libreria para el sistema de archivo
const {ExpressPeerServer} = require('peer');
const {v4:uuidv4} = require('uuid');


// Definiciones basicas del servidor
const app = express();
const server = http.createServer(app);
const peer = ExpressPeerServer(server,{ debug:true});

const io = new SocketIO(server);
const PORT = process.env.PORT || 8000;

// Las dependencias que usará la aplicación. Y los archivos estaticos.
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'uploads')));
app.use(siofu.router)
app.use('/peerjs', peer);

// La unica ruta que necesitaremos
app.get('/:room', (req, res) => {
  return res.render("index.ejs", {roomId: req.params.room});
});
// Por default, genera una nueva sala con la que las personas se conectaran.
app.get('/', (req, res) => {
  res.redirect(`/${uuidv4()}`)
})

// La "base de datos" de usuarios.
var text_users = [];
var files_users = [];

io.on('connection', (socket) => {
  // Escuchamos los eventos de socket.io

  // Definimos el oyente de archivos aqui, y le definimos su ruta de subida.
  var uploader = new siofu();
  uploader.dir = path.join(__dirname,"/uploads/");
  uploader.listen(socket);

  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId)  // Join the room
    socket.broadcast.emit('user-connected', userId) // Tell everyone else in the room that we joined
    
  })

  uploader.on("saved", (e) => {
    // Evento del servidor para el oyente de archivos cuando un archivo es guardado.
    // Revisa si existe el archivo que se subió, y lo reemplaza por el nuevo.
    try {
      var path_viejo = path.join(uploader.dir, e.file.name);
      var path_nuevo = e.file.writeStream.path;
      // Si ambas rutas son iguales, el archivo es nuevo en el servidor.
      // No requiere reeemplazar.
      if (path_nuevo != path_viejo) {
        // Si son distintas, entonces ya existe un archivo así.
        // Entonces solo es renombrar el viejo archivo
        fs.renameSync(path_viejo, path_viejo + ".old", () => {
          console.log("Renombra el archivo original a algo mas viejo");
        })
        // Renombrarlo al nombre original al archivo subido.
        fs.renameSync(path_nuevo, path_viejo, () => {
          console.log("Renombra el nuevo archivo al nombre original");
        })
        // y Desenlazar (o eliminar) el viejo para guardar los cambios.
        fs.unlinkSync(path_viejo + ".old", () => {
          console.log("Elimina el archivo viejo");
        });
        var archivo = files_users.find(f => f.file == e.file.name)
        // Si el archivo ya existe desde que el servidor se inició, añadelo a la bd.
        // Si fue despues de eso, solo dale la hora normal
        if(archivo == null) 
          files_users.push({ 
            file : e.file.name, 
            uploaded_time: horaEnString(),
            update_time: horaEnString()
            });
        else archivo.update_time = horaEnString();
      }
      else {
        // Si no existe, guardalo en la bd
        files_users.push({
           file : e.file.name,
           uploaded_time: horaEnString(),
           update_time: horaEnString()
          });
      }
      // Actualiza la lista de archivos y enviaselos a todos los presentes.
      enviaListaDeArchivos(io.sockets, uploader.dir);
    } catch(err) {
      console.error(err)
    }
  });

  socket.on("text:file", (data) => {
    // Servidor recive el evento de la subida de archivo exitosa de un usuario, avisale a todos.
    io.sockets.emit("text:file", data)
  });

  socket.on("text:msg", (data) => {
    // Servidor recive un mensaje, avisale a todos.
    io.sockets.emit("text:msg", data);
  });

  socket.on("text:typing", (data) => {
    // Servidor detecta escritura por parte de un usuario, avisale a todos menos al que escribe.
    socket.broadcast.emit("text:typing", data);
  });

  socket.on("text:join", (data) => {
    // Servidor detecta una nueva conexión, avisale a todos menos al recien llegado,
    // y guardalo en un array, para salvar los datos del usuario.
    console.log("Alguien se ha unido!")
    socket.join(data.roomId);
    const sid = socket.id;
    text_users.push({ sid : sid, user: data.username});
    socket.broadcast.emit("text:join", data);
    enviaListaDeArchivos(io.sockets, uploader.dir);
  });

  socket.on("text:users", () => {
    // El servidor recibe una peticion de listado de usuario, enviaselo a todos.
    var data = {};
    data.connects = text_users;
    io.sockets.emit("text:users", data);
  });

  socket.on('disconnect', function() {
    // El servidor detecta una desconexión, avisa a todos, 
    // actualiza el listado de usuarios y envia las señales de las listas de usuario
    // para todos los clientes.
    socket_leave = text_users.find(s => s.sid == socket.id);
    text_users.find(s => s.sid == socket.id);
    if(socket_leave != null){
      console.log(socket_leave)
      socket.broadcast.emit("text:leave", {username: socket_leave.user, time: horaEnString()});
      text_users = text_users.filter(s => s.sid != socket.id);
    }
  });

});

// Inicia el servidor!
server.listen(PORT, () => console.log(`Server started at PORT:${PORT}`));

// Pequeño ayudante para marcar la hora.
function horaEnString(){
  var datetime = new Date()
   return datetime.toLocaleTimeString();
} 

function enviaListaDeArchivos(sockets, dir){
  // Revisa si el servidor elimino algun archivo
  var file_list = [];
  fs.readdirSync(dir).forEach(file => {

    var existe = files_users.find(f => f.file == file);
    if(existe){
      file_list.push(existe);
    }
  });

  files_users = file_list;

  sockets.emit("text:files", files_users);
}