var nick = prompt("Ingresa un nombre de usuario");

while(nick == null || nick.trim().length <= 0 ){
    var nick = prompt("Nombre de usuario");
}
//alert("Hola " + nick);

nickname = nick;

filesend = document.getElementById("fileSend");
textoSend = document.getElementById("textoSend");
inputText = document.getElementById("inputText");
chatlog = document.getElementById("chat-log");
chatactions = document.getElementById("chat-actions");
chatupload = document.getElementById("chat-upload");
chatusers = document.getElementById("chat-users");
chatfiles = document.getElementById("chat-files");
const videoGrid = document.getElementById('chat-videos')

// SocketIO del lado del cliente.
const socket = io();
var siofu = new SocketIOFileUpload(socket);
const myPeer = new Peer();
const myVideo = document.createElement('video') // Haz un nuevo video
myVideo.muted = true

// Habilita la camara y el microfono (Aunque para la grabacion, estará desactivado)
navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
}).then(stream => {
    anadeMiVideo(myVideo, stream) // Muestra tu propio video

    myPeer.on('call', call => { 
        // Cuando alguien se conecta a la aplicación
        call.answer(stream) // echale el stream del usuario
        const video = document.createElement('video') // Dales un tag de video
        call.on('stream', userVideoStream => { // Al recibir  los stream del grupo
            anadeMiVideo(video, userVideoStream) // Muestrale todos los videos de las demas personas.
        })
    })

    // Para cuando alguien se une al chat, envia su video a la persona
    socket.on("text:join", (data) => {
        chatlog.innerHTML += "<strong> [" + data.time + "] ("+ data.username +") Se ha unido al chat.</strong><br>";
        chatactions.innerHTML = "";
        socket.emit("text:users", {});
        conectateAlNuevoUsuario(data, stream) 
    });
})

function conectateAlNuevoUsuario(data, stream) { 
    // Ejecuta esto cuando alguien entre a la sala.
    const call = myPeer.call(data.userId, stream) // Call the user who just joined
    // Add their video
    const video = document.createElement('video') 
    call.on('stream', userVideoStream => {
        anadeMiVideo(video, userVideoStream)
    })
    // If they leave, remove their video
    call.on('close', () => {
        console.log("Ya se fue?")
        video.remove()
    })
    call.on('disconnected', () => {
        console.log("Ya se fue?")
        video.remove()
    })
}

// Crea una ventana de video
function anadeMiVideo(video, stream) {
    const br = document.createElement("br")
    video.srcObject = stream 
    video.addEventListener('loadedmetadata', () => { // Play the video as it loads
        video.play()
    })
    videoGrid.append(video) // Append video element to videoGrid
    
}

// Define el boton para subir archivos
filesend.addEventListener("click", siofu.prompt, false);

// Subida en proceso, Para mostrar el progreso del archivo a subir.
siofu.addEventListener("progress", function(event){
    var percent = event.bytesLoaded / event.file.size * 100;
    chatupload.innerHTML = "Archivo subido al: "+percent.toFixed(2)+" % ";
});

// Subida completada, avisale al servidor que has compartido un documento.
siofu.addEventListener("complete", function(event){
    chatupload.innerHTML = "Archivo subido y enviado a todos los presentes.";
    if(event.success){
        socket.emit("text:file", {
            username: nickname,
            message: inputText.value,
            time: horaEnString(),
            file: event.file.name
        });
    }
    setTimeout(() => {chatupload.innerHTML = ""}, 10000);
});

myPeer.on('open', id => { 
    // Cuando el cliente abra la app, avisale a las personas que alguien se ha conectado
    socket.emit("text:join", {
        userId: id,
        roomId: ROOM_ID,
        username: nickname,
        message: inputText.value,
        time: horaEnString()
    });
    socket.emit("text:users", {});
})

// Aplica un evento cuando envies un mensaje.
textoSend.addEventListener("click", () => {
    if(inputText.value.trim().length > 0){
        socket.emit("text:msg", {
            username: nickname,
            message: inputText.value,
            time: horaEnString()
        });
        inputText.value = "";
    }
});

// Evento de keypress de enter, para enviar el mensaje sin presionar el botón
document.onkeydown = (e) => {
    e = e || window.event;
    switch (e.which || e.keyCode) {
          case 13 : //En ascii eso es Enter.
            if(inputText.value.trim().length > 0){
                socket.emit("text:msg", {
                    username: nickname,
                    message: inputText.value,
                    time: horaEnString()
                });
                inputText.value = "";
            }
          break;
    }
}

// Si estás escribiendo, avisale al servidor.
inputText.addEventListener("keypress", () => {
    socket.emit("text:typing", {
        username: nickname,
        message: inputText.value
    });
})
// Los eventos del cliente cuando el servidor envia una respuesta.
// Para mensaje normal de texto
socket.on("text:msg", (data) => {
    chatlog.innerHTML += "<strong> [" + data.time + "] ("+ data.username +")</strong>: "+ data.message + "<br>";
    chatactions.innerHTML = "";
});

// Para Actualizar la lista de usuarios
socket.on("text:users", (data) => {
    chatusers.innerHTML = "";
    
    if(data.connects != null && data.connects.length > 0){
        chatusers.innerHTML = "<h3>Usuarios Conectados</h3>";
        var ul = document.createElement("ul");
        data.connects.forEach(e => {
            var li = document.createElement("li");
            ul.appendChild(li);
            li.innerHTML = e.user + (nickname == e.user ? "(Tu)" : "");
        });
        chatusers.appendChild(ul);
    }
});

// Para actualizar la lista de archivos
socket.on("text:files", (files) => {
    chatfiles.innerHTML = "";
    if(files != null && files.length > 0){
        chatfiles.innerHTML = "<h3>Archivos Enviados</h3>";
        var ul = document.createElement("ul");
        files.forEach(f => {
            var li = document.createElement("li");
            ul.appendChild(li);
            li.innerHTML = "<b><a href='/"+ f.file +"'>"+ f.file + "</a></b>" 
            + " (Subido: "+ f.uploaded_time + ", Actualizado: " + f.update_time +")";
        });
        chatfiles.appendChild(ul);
    }
});
// Cuando alguien se va del chat, así actualiza la lista de usuarios.
socket.on("text:leave", (data) => {
    chatlog.innerHTML += "<strong> [" + data.time + "] ("+ data.username +") Se ha ido del chat. </strong><br>";
    chatactions.innerHTML = "";
    socket.emit("text:users", {});
});

// Cuando alguien en el chat de texto está escribiendo un mensaje
socket.on("text:typing", (data) => {
    //alert(data);
    chatactions.innerHTML = "<strong>"+data.username+"</strong> intenta decir algo...";
    setTimeout(() => {chatactions.innerHTML = ""}, 10000);
});

// Para los archivos recibidos, crea un link de descarga a ese archivo
socket.on("text:file", (data) => {
    chatlog.innerHTML += "<strong> " + data.time + " ("+ data.username 
    +") Ha subido un archivo </strong> <a href='/"+ data.file +"'>"+ data.file +"</a><br>";
});

function ShowContent() {
    btn_texto.style.display = "none";
    btn_video.style.display = "none";
    if (arguments.length > 0){
      for(var i=0; i < arguments.length; i++){
        document.getElementById(arguments[i]).style.display = "";
      }
    } 
  }

  function horaEnString(){
        var datetime = new Date()
         return datetime.toLocaleTimeString();
  } 
