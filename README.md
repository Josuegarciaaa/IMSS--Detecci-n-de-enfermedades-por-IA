# Exportar y alojar modelo Teachable Machine

Para que el modelo de Teachable Machine funcione correctamente en tu página web, necesitas exportar los archivos del modelo (model.json, metadata.json, weights.bin) y alojarlos en un servidor accesible.

## Pasos para exportar y alojar el modelo

1. Entra a tu proyecto en Teachable Machine.
2. Haz clic en "Export Model".
3. Selecciona "Download" para descargar los archivos del modelo.
4. Extrae los archivos descargados en una carpeta dentro de tu proyecto web, por ejemplo `model/`.
5. Asegúrate de que los archivos `model.json`, `metadata.json` y `weights.bin` estén en esa carpeta.
6. Cambia la URL del modelo en tu código JavaScript para que apunte a la carpeta local, por ejemplo:

```js
const MODEL_URL = "./model/";
```
