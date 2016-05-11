/// <reference path="Note.ts" />

const dbName = "test";
const noteStoreName = "notes";

function connectToDB(): Promise<IDBDatabase>{

    function promiseFunc(resolve) {

        //get idb factory
        let dbFactory:IDBFactory = window.indexedDB;

        //use idb factory to connect to db called `test`. the function call immediately returns the request that is sent to
        //connect to db. When the connection is successful, the request's onsuccess/onerror call back will be invoked.
        let request:IDBOpenDBRequest = dbFactory.open(dbName);

        //when the connection is successful this call back is invoked.
        //note that if onupgradeneeded is invoked, it is called before onsuccess.
        request.onsuccess = function(evt: Event) {
            //once connection is successful, database is available as the `result` of IDBOpenDBRequest. store this to a global
            //variable for reuse later. this connection will be closed automatically when you leave the page.
            let idb: IDBDatabase = request.result;
            resolve(idb);
        };

        //if this connection fails, this call back is invoked.
        request.onerror = function() {
            throw new Error("an error has occurred when connecting to indexdedDB");
        };

        //if I connect to a database that does not exist, it will be created, when it is created, this call back will be invoked,
        //this is where i define the database schema, such as objectStore, index, id and so on.
        //this call back is also invoked when i upgrade the database. Check out IDBFactory::open
        //notice if this call back get invoked, it is invoked before onsuccess.
        request.onupgradeneeded = function(evt:IDBVersionChangeEvent) {
            //when the callback is invoked, database is available as IDBOpenDBRequest.result
            let idb: IDBDatabase = request.result;
            if (idb.objectStoreNames.contains(noteStoreName)) idb.deleteObjectStore(noteStoreName);
            let store:IDBObjectStore = idb.createObjectStore(noteStoreName, {keyPath: 'id', autoIncrement: true});
            store.createIndex('title', 'title', {unique: true, multiEntry: false});
        };
    }

    return new Promise(promiseFunc);
}

function iterateAllNotes(idb: IDBDatabase, noteProcessor: (note: Note) => any): Promise<void> {

    function promiseFunc(resolve){
        //begin a transaction
        let transaction: IDBTransaction = idb.transaction(noteStoreName, "readonly");
        //a transaction's scope can be over multiple object stores, here i need to select one store from the scope.
        let objectStore: IDBObjectStore = transaction.objectStore(noteStoreName);
        //open a cursor to iterate all records in this object store
        let request: IDBRequest = objectStore.openCursor();

        //each time the cursor moves this callback is invoked
        request.onsuccess = function() {
            //the cursor is available as IDBRequest.result
            let cursor:IDBCursorWithValue = request.result;
            if(cursor) {
                //the data the cursor points to is available as IDBCursorWithValue.value
                //here i invoke the passed in function to do something with the data.
                noteProcessor(cursor.value);
                //tell the cursor to move on.
                cursor.continue();
            } else {
                //no more records, fulfill the promise.
                resolve();
            }
        }
    }

    return new Promise<void>(promiseFunc);

}

function addNote(idb: IDBDatabase, note: Note): Promise<number> {

    function promiseFunc(resolve){
        //signal to start a transaction, you need to tell which object stores the transaction is going
        //to deal with (so that maybe it can lock it or something?)
        let transaction = idb.transaction(noteStoreName, "readwrite");

        //now i need to pick one object store mentioned above
        let store = transaction.objectStore(noteStoreName);
        //this `add` operation will be included in the transaction
        let request = store.add(note);

        let generatedId;
        //this callback will be invoked when the item gets added
        //note that if the transaction fail, the addition may be rolled back
        request.onsuccess = function(){
            //here the generated id of the item is available as request result
            //remember it for now and do not do anything hasty.
            generatedId = request.result;
        };

        //the transaction is complete, now its safe to move on.
        transaction.oncomplete = function() {
            //finally fulfill the promise and send the generated ids to resolve callback.
            resolve(generatedId);
        };
        //my guess:
        //transaction will really start after this function call and the control returned back to event loop

    }

    return new Promise(promiseFunc);

}