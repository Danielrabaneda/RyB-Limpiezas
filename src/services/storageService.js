import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { v4 as uuidv4 } from 'uuid';

export async function uploadPhoto(file, userId, serviceId) {
  const ext = file.name.split('.').pop();
  const fileName = `${uuidv4()}.${ext}`;
  const path = `evidence/${userId}/${serviceId}/${fileName}`;
  const storageRef = ref(storage, path);
  
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return url;
}

export async function uploadMultiplePhotos(files, userId, serviceId) {
  const urls = [];
  for (const file of files) {
    const url = await uploadPhoto(file, userId, serviceId);
    urls.push(url);
  }
  return urls;
}
