import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../config/firebase";
import { v4 as uuidv4 } from "uuid";

export async function uploadPhoto(companyId, file, userId, serviceId) {
  const ext = file.name.split(".").pop();
  const fileName = `${uuidv4()}.${ext}`;
  const path = `companies/${companyId}/evidence/${userId}/${serviceId}/${fileName}`;
  const storageRef = ref(storage, path);

  const metadata = {
    contentType: file.type || "image/jpeg",
  };

  await uploadBytes(storageRef, file, metadata);
  const url = await getDownloadURL(storageRef);
  return url;
}

export async function uploadMultiplePhotos(companyId, files, userId, serviceId) {
  const urls = [];
  for (const file of files) {
    const url = await uploadPhoto(companyId, file, userId, serviceId);
    urls.push(url);
  }
  return urls;
}
