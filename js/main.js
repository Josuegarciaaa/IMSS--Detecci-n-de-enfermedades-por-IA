const MODEL_URL = "./src/";

let model, webcam, labelContainer, maxPredictions;
let modelLoaded = false;

// Emoji map for diseases
const emojiMap = {
    "COVID 19": "😷",
    "Tuberculosis": "🫁",
    "Tumor Cerebral": "🧠",
    "Sano": "✅",
    "Neumonia": "🫁"
};

function initLabels() {
    labelContainer = document.getElementById("label-container");
    labelContainer.innerHTML = "";
    for (let i = 0; i < maxPredictions; i++) {
        const labelDiv = document.createElement("div");
        labelDiv.className = "label";
        labelContainer.appendChild(labelDiv);
    }
}

async function loadModel() {
    if (modelLoaded) return;
    try {
        const modelURL = MODEL_URL + "model.json";
        const metadataURL = MODEL_URL + "metadata.json";

        // Show loading spinner and hide controls
        document.getElementById("loading-spinner").style.display = "flex";
        document.getElementById("controls").style.display = "none";

        // Update progress
        document.getElementById("loading-progress").value = 25;

        console.log("Loading model from", modelURL);
        model = await tmImage.load(modelURL, metadataURL);

        document.getElementById("loading-progress").value = 75;
        maxPredictions = model.getTotalClasses();
        console.log("Model loaded, classes:", maxPredictions);
        modelLoaded = true;

        // Add event listener for image upload
        const imageUpload = document.getElementById("image-upload");
        imageUpload.addEventListener("change", handleImageUpload);

        // Add event listener for clear upload
        const clearUpload = document.getElementById("clear-upload");
        clearUpload.addEventListener("click", clearUploadedFile);

        // Initialize label container
        initLabels();

        document.getElementById("loading-progress").value = 100;

        // Hide loading spinner and show controls
        document.getElementById("loading-spinner").style.display = "none";
        document.getElementById("controls").style.display = "flex";
    } catch (error) {
        console.error("Error loading model:", error);
        alert("Error al cargar el modelo. Revisa la consola para más detalles.");
    }
}

async function init() {
    console.log("Init function called");

    if (!model) {
        await loadModel();
    }
    initLabels();

    // Remove WebRTC support check to avoid false negatives in Edge and other browsers
    // Instead, rely on try-catch to handle unsupported cases

    // Check if camera access is possible (requires HTTPS or localhost)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        const webcamContainer = document.getElementById("webcam-container");
        webcamContainer.innerHTML = "<p class='error-message'>Para acceder a la webcam, por favor usa HTTPS o localhost. Actualmente estás en " + location.protocol + "//" + location.hostname + "</p>";
        return;
    }

    // Ask user for permission to start webcam
    const start = confirm("¿Deseas iniciar la cámara para detección en tiempo real?");
    if (!start) {
        return;
    }

    const flip = true;
    let initialized = false;
    while (!initialized) {
        try {
            webcam = new tmImage.Webcam(160, 120, flip);
            console.log("Webcam object created:", webcam);
            await webcam.setup();
            console.log("Webcam setup complete");

            // Fix for Edge and some browsers: create video element manually if missing
            if (!webcam.webcam) {
                console.log("Creating video element manually for compatibility");
                const video = document.createElement("video");
                video.setAttribute("autoplay", "");
                video.setAttribute("playsinline", "");
                video.style.display = "block";
                video.style.margin = "0 auto";
                video.style.borderRadius = "15px";
                video.style.boxShadow = "0 8px 25px rgba(0, 0, 0, 0.15)";
                video.style.background = "rgba(0, 0, 0, 0.05)";
                video.width = 160;
                video.height = 120;
                if (webcam.stream) {
                    video.srcObject = webcam.stream;
                    // Wait for video to be ready
                    await new Promise((resolve) => {
                        if (video.readyState >= 2) {
                            resolve();
                        } else {
                            video.onloadedmetadata = () => resolve();
                        }
                    });
                }
                webcam.webcam = video;
                webcam.video = video;
            }

            // Additional fix: wait for video element to be ready before playing
            // Removed the readyState wait as it may prevent play

            const webcamContainer = document.getElementById("webcam-container");
            webcamContainer.innerHTML = "";
            webcamContainer.style.opacity = '0';
            // Show the video element for visibility
            if (webcam.webcam) {
                webcam.webcam.style.display = 'block';
                webcamContainer.appendChild(webcam.webcam);
            }
            // Append canvas but hide it, needed for predictions
            if (webcam.canvas) {
                webcam.canvas.style.display = 'none';
                webcamContainer.appendChild(webcam.canvas);
            }

            await webcam.play();
            webcam.playing = true;
            console.log("Webcam play started");
            lastPredictTime = 0;
            window.requestAnimationFrame(loop);

            // Animate webcam container fade in
            webcamContainer.style.transition = 'opacity 0.5s ease-in';
            webcamContainer.style.opacity = '1';

            document.getElementById("stop-button").style.display = "inline-block";
            initialized = true;
        } catch (error) {
            console.error("Webcam initialization error:", error);
            const webcamContainer = document.getElementById("webcam-container");
            if (error.name === 'NotAllowedError') {
                webcamContainer.innerHTML = "<p class='error-message'>Acceso a la webcam denegado. Por favor, permite el acceso a la cámara en la configuración de tu navegador.</p>";
                break;
            } else if (error.name === 'NotFoundError') {
                webcamContainer.innerHTML = "<p class='error-message'>No se encontró una webcam. Conecta una cámara y vuelve a intentarlo.</p>";
                break;
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                webcamContainer.innerHTML = "<p class='error-message'>No se puede acceder a la webcam. Puede estar siendo usada por otra aplicación o no estar disponible.</p>";
                break;
            } else {
                // Provide a more detailed error message with possible causes
                webcamContainer.innerHTML = "<p class='error-message'>Error al acceder a la webcam. " +
                    "Por favor, verifica que tu navegador esté actualizado, que la cámara esté conectada y que no esté siendo usada por otra aplicación. " +
                    "También asegúrate de permitir el acceso a la cámara cuando el navegador lo solicite.</p>";
                break;
            }
        }
    }
}

let lastPredictTime = 0;

async function loop() {
    console.log("Loop called, webcam:", !!webcam, "playing:", webcam ? webcam.playing : 'no webcam');
    if (!webcam || !webcam.playing) return;
    webcam.update();
    const now = Date.now();
    if (now - lastPredictTime > 5000) { // Update predictions every 5 seconds
        await predict();
        lastPredictTime = now;
    }
    window.requestAnimationFrame(loop);
}

async function predict() {
    if (!webcam || !webcam.playing) return;
    console.log("Predict called");
    console.log("Model loaded:", !!model);
    console.log("Webcam canvas:", webcam.canvas);
    try {
        const prediction = await model.predict(webcam.canvas);
        console.log("Prediction result:", prediction);
        // Find the maximum probability
        const maxProb = Math.max(...prediction.map(p => p.probability));
        console.log("Max probability:", maxProb);
        if (maxProb < 0.5) { // Threshold for unknown
            for (let i = 0; i < maxPredictions; i++) {
                const labelDiv = labelContainer.childNodes[i];
                labelDiv.innerHTML = "Desconocido";
                labelDiv.classList.remove("updating");
            }
        } else {
            // Find the class with the highest probability
            const maxIndex = prediction.findIndex(p => p.probability === maxProb);
            const topClass = prediction[maxIndex].className;
            const emoji = emojiMap[topClass] || "❓";

            // Trigger emoji rain
            createEmojiRain(emoji);

            for (let i = 0; i < maxPredictions; i++) {
                const classPrediction =
                    prediction[i].className + ": " + (prediction[i].probability * 100).toFixed(2) + "%";
                const labelDiv = labelContainer.childNodes[i];
                console.log("Updating label", i, "with", classPrediction);
                labelDiv.innerHTML = classPrediction;
                labelDiv.classList.add("updating");
                setTimeout(() => {
                    labelDiv.classList.remove("updating");
                }, 600);
            }
        }
    } catch (error) {
        console.error("Error in predict:", error);
    }
}

async function handleImageUpload(event) {
    console.log("Handling image upload");
    const file = event.target.files[0];
    const clearUpload = document.getElementById("clear-upload");
    if (!file) {
        clearUpload.style.display = "none";
        return;
    }
    clearUpload.style.display = "inline-block";

    // Check if the file is an image
    if (!file.type.startsWith('image/')) {
        alert('Por favor, sube un archivo de imagen válido.');
        event.target.value = ''; // Clear the input
        clearUpload.style.display = "none";
        return;
    }

    const img = new Image();
    img.src = window.URL.createObjectURL(file);
    img.onload = async () => {
        console.log("Image loaded, predicting");

        // Display the uploaded image
        const webcamContainer = document.getElementById("webcam-container");
        webcamContainer.innerHTML = ""; // Clear any existing content
        img.style.width = "340px";
        img.style.height = "280px";
        img.style.display = "block";
        img.style.borderRadius = "15px";
        img.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.2)";
        img.style.objectFit = "cover";
        webcamContainer.appendChild(img);

        const prediction = await model.predict(img);
        console.log("Prediction:", prediction);
        // Find the maximum probability
        const maxProb = Math.max(...prediction.map(p => p.probability));
        console.log("Max probability:", maxProb);
        if (maxProb < 0.5) { // Threshold for unknown
            for (let i = 0; i < maxPredictions; i++) {
                labelContainer.childNodes[i].innerHTML = "Desconocido";
            }
        } else {
            // Find the class with the highest probability
            const maxIndex = prediction.findIndex(p => p.probability === maxProb);
            const topClass = prediction[maxIndex].className;
            const emoji = emojiMap[topClass] || "❓";

            // Trigger emoji rain
            createEmojiRain(emoji);

            // Add flash effect to image upload
            const imageUpload = document.getElementById("image-upload");
            imageUpload.classList.add('image-upload-flash');
            setTimeout(() => {
                imageUpload.classList.remove('image-upload-flash');
            }, 500);

            for (let i = 0; i < maxPredictions; i++) {
                const classPrediction =
                    prediction[i].className + ": " + (prediction[i].probability * 100).toFixed(2) + "%";
                labelContainer.childNodes[i].innerHTML = classPrediction;
            }
        }
    };
}

function createEmojiRain(emoji, count = 20) {
    const emojiRain = document.createElement('div');
    emojiRain.className = 'emoji-rain';
    document.body.appendChild(emojiRain);

    for (let i = 0; i < count; i++) {
        const emojiElement = document.createElement('div');
        emojiElement.className = 'emoji';
        emojiElement.textContent = emoji;
        emojiElement.style.left = Math.random() * 100 + '%';
        emojiElement.style.animationDelay = Math.random() * 2 + 's';
        emojiElement.style.animationDuration = (Math.random() * 2 + 2) + 's';
        emojiRain.appendChild(emojiElement);
    }

    setTimeout(() => {
        document.body.removeChild(emojiRain);
    }, 5000);
}

function clearUploadedFile() {
    const imageUpload = document.getElementById("image-upload");
    const clearUpload = document.getElementById("clear-upload");
    const webcamContainer = document.getElementById("webcam-container");
    imageUpload.value = "";
    clearUpload.style.display = "none";

    // Add flash effect
    imageUpload.classList.add('clear-upload-flash');
    setTimeout(() => {
        imageUpload.classList.remove('clear-upload-flash');
    }, 500);

    // Clear predictions related to image upload
    for (let i = 0; i < maxPredictions; i++) {
        labelContainer.childNodes[i].innerHTML = "";
    }

    // Clear displayed uploaded image
    webcamContainer.innerHTML = "";
}

function stop() {
    if (webcam) {
        const webcamContainer = document.getElementById("webcam-container");
        // Animate fade out before clearing
        webcamContainer.style.transition = 'opacity 0.5s ease-out';
        webcamContainer.style.opacity = '0';
        setTimeout(() => {
            webcam.stop();
            webcam = null;
            webcamContainer.innerHTML = "";
            webcamContainer.style.opacity = '1'; // Reset for next use
        }, 500);
        // Keep predictions visible, do not clear labelContainer
    }
    document.getElementById("stop-button").style.display = "none";
}

function createParticles() {
    const particlesContainer = document.querySelector('.floating-particles');
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.width = Math.random() * 10 + 5 + 'px';
        particle.style.height = particle.style.width;
        particle.style.animationDelay = Math.random() * 5 + 's';
        particlesContainer.appendChild(particle);
    }
}

window.onload = function() {
    createParticles();
    loadModel();
};
