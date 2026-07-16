export class StorageService {
    saveToLocal(key: any, value: any): void;
    saveToSession(key: any, value: any): void;
    getFromLocal(key: any): any;
    getFromSession(key: any): any;
}
