///<reference path="CodeEditor.ts"/>
///<reference path="AppEvents.ts"/>
///<reference path="CommandsSection.ts"/>
///<reference path="BodySection.ts"/>
///<reference path="TextProcessor.ts"/>
///<reference path="ReferenceCache.ts"/>
///<reference path="TagsCache.ts"/>
///<reference path="NoteNameCache.ts"/>
///<reference path="PreviewWindow.ts"/>

namespace EVNoteSectionNamespace {
    
    import createCodeEditor = CodeEditorNamespace.createCodeEditor;
    import register = AppEventsNamespace.register;
    import AppEvent = AppEventsNamespace.AppEvent;
    import setCommandButtons = CommandsSectionNamespace.setCommandButtons;
    import setBody = BodySectionNamespace.setBody;
    import findTags = ContentTransformerNamespace.findTags;
    import findReferences = ContentTransformerNamespace.findReferences;
    import getIDB = StorageNamespace.getIDB;
    import KeywordProcessor = IndexNamespace.KeywordProcessor;
    import getIndex = IndexNamespace.getIndex;
    import removeReference = ReferenceCacheNamespace.removeReference;
    import setTagsForNote = TagsCacheNamespace.setTagsForNote;
    import addReference = ReferenceCacheNamespace.addReference;
    import r = Utility.r;
    import convertToStyledDocumentFragment = ContentTransformerNamespace.convertToStyledDocumentFragment;
    import getNote = StorageNamespace.getNote;
    import broadcast = AppEventsNamespace.broadcast;
    import setNoteName = NoteNameCacheNamespace.setNoteName;
    import closePreviewWindow = PreviewWindowNamespace.closePreviewWindow;
    import getPreviewWindow = PreviewWindowNamespace.getPreviewWindow;
    import getNoteName = NoteNameCacheNamespace.getNoteName;
    import getIdOfNotesThatReferences = ReferenceCacheNamespace.getIdOfNotesThatReferences;
    import tokenizeParagraph = TokenizorNamespace.tokenizeParagraph;
    import search = RankNamespace.search;
    import NoteScoreDetail = RankNamespace.NoteScoreDetail;

    let index = getIndex();

    let note: Note;

    let codeEditor = createCodeEditor();

    let noteViewerEle = document.createElement("div");
    noteViewerEle.classList.add("noteViewer");

    let viewButton = document.createElement("button");
    viewButton.appendChild(document.createTextNode("View"));
    let deleteButton = document.createElement("button");
    deleteButton.appendChild(document.createTextNode("Delete"));
    let editButton = document.createElement("button");
    editButton.appendChild(document.createTextNode("Edit"));
    let editNoteCommandButtons = [viewButton, deleteButton];
    let viewNoteCommandButtons = [editButton, deleteButton];

    let idOfAutoSaveInterval: number;

    function createNewNote(){
        setCommandButtons(editNoteCommandButtons);
        note = new Note(Date.now(), Date.now());
        codeEditor.setTitle(note.title);
        codeEditor.setValue([]);
        setBody(codeEditor.containerEle);
        startAutoSaveInterval();
    }
    
    function* editNote(){
        setCommandButtons(editNoteCommandButtons);
        codeEditor.setTitle(note.title);
        codeEditor.setValue(note.components);
        setBody(codeEditor.containerEle);
        startAutoSaveInterval();
    }

    function* viewNote() {
        setCommandButtons(viewNoteCommandButtons);
        while(noteViewerEle.firstChild)
            noteViewerEle.removeChild(noteViewerEle.firstChild);

        let titleEle = document.createElement("h2");
        titleEle.appendChild(document.createTextNode(note.title));
        titleEle.classList.add("title");

        noteViewerEle.appendChild(titleEle);

        let domFrag = yield* convertToStyledDocumentFragment(note.components);
        noteViewerEle.appendChild(domFrag);

        //references
        if(note.references.length > 0) {
            let referencesDiv = document.createElement("div");
            let referencesDivTitle = document.createElement("h3");
            referencesDivTitle.innerText = "This note references";
            referencesDiv.appendChild(referencesDivTitle);
            for(let reference of note.references) {
                referencesDiv.appendChild(createNoteLink(reference));
            }
            noteViewerEle.appendChild(referencesDiv);
        }

        //referenced by
        if(getIdOfNotesThatReferences(note.id).size > 0) {
            let referencedBysDiv = document.createElement("div");
            let referencedByTitle = document.createElement("h3");
            referencedByTitle.innerText = "This note is referenced by";
            referencedBysDiv.appendChild(referencedByTitle);
            for(let referencedBy of getIdOfNotesThatReferences(note.id)) {
                referencedBysDiv.appendChild(createNoteLink(referencedBy));
            }
            noteViewerEle.appendChild(referencedBysDiv);
        }
        
        let searchKeyWordsForFindingRelatedNotes = [];
        let titleTokens = tokenizeParagraph(note.title);
        for (let i = 0; i < titleTokens.tokenTypes.length; i++) {
            if(titleTokens.tokenTypes[i] === WordType.word)
                searchKeyWordsForFindingRelatedNotes.push(titleTokens.tokenValues[i]);
        }
        searchKeyWordsForFindingRelatedNotes = searchKeyWordsForFindingRelatedNotes.concat(note.tags);
        let searchResults = search(searchKeyWordsForFindingRelatedNotes);
        let relatedNoteIds = searchResults.results.map(function(r: NoteScoreDetail) {
            return r.noteId;
        }).slice(0, 10);
        
        if(relatedNoteIds.length > 0) {
            let relatedDiv = document.createElement("div");
            let relatedDivTitle = document.createElement("h3");
            relatedDivTitle.innerText = "Possible related notes";
            relatedDiv.appendChild(relatedDivTitle);
            for(let related of relatedNoteIds) {
                relatedDiv.appendChild(createNoteLink(related));
            }
            noteViewerEle.appendChild(relatedDiv);           
        }
        setBody(noteViewerEle);
    }

    function createNoteLink(noteId: number) {
        let noteName = getNoteName(noteId);
        let button = document.createElement("button");
        button.innerText = noteName;
        button.onclick = function(){
            broadcast(AppEvent.viewNote, noteId);
        };
        return button;
    }

    function removeNoteContentFromIndexAndCache(){
        //if not a new note, first remove all search key words from pre-modified content
        let titleWords = note.title.split(" ");
        titleWords.forEach(function(e) {
            index.remove(e, false, note.id);
        });
        let tpc = new KeywordProcessor(note.components);
        let kws = tpc.getKeyWords();
        for(let i = 0; i < kws.length; i++) {
            index.remove(kws[i][0], kws[i][1], note.id);
        }
        //if not a new note, remove related tags in tag cache
        setTagsForNote(note.id, []);

        //if not a new note, remove related references in reference cache
        note.references.forEach(function(referenceId: number){
            removeReference(referenceId, note.id);
        });
    }

    function* storeNote(): IterableIterator<any> {
        if(note.id) removeNoteContentFromIndexAndCache();
        //convert the new content to component list and set the components in note
        let components:Component[] = codeEditor.getValue();
        note.components = components;
        note.title = codeEditor.getTitle();
        //if user does not specify a note title, use the first 50 characters in the note content as the title.
        if(note.title === undefined || note.title.trim() === "") {
            for(let component of note.components) {
                if(component.nodeName === "#text" && component.value.trim() !== "") {
                    let cv = component.value.trim();
                    note.title = cv.substring(0, 50);
                    if(note.title.length < cv.length) note.title += "...";
                    break;
                }
            }
        }
        //find and set new tags in note
        note.tags = findTags(components);
        //find and set mew references in note.
        note.references = findReferences(components);
        //store the note in db
        let idb: IDBDatabase = yield getIDB();
        yield StorageNamespace.storeNote(idb, note);
        //add search key words from new content to index
        let titleWords = note.title.split(" ");
        titleWords.forEach(function(e) {
            index.putAsSearchKeyword(e, false, note.id);
        });
        let tpc = new KeywordProcessor(components);
        let kws = tpc.getKeyWords();
        for(let i = 0; i < kws.length; i++) {
            index.putAsSearchKeyword(kws[i][0], kws[i][1], note.id);
        }
        //update note name in note name cache
        setNoteName(note.id, note.title);
        //add new tags to the tag cache
        setTagsForNote(note.id, note.tags);
        //add new reference relationship to reference cache
        note.references.forEach(function(referenceId: number){
            addReference(referenceId, note.id);
        });
    }

    function* deleteNote(): IterableIterator<any> {
        //remove it from db
        let idb: IDBDatabase = yield getIDB();
        yield StorageNamespace.deleteNote(idb, note.id);
        removeNoteContentFromIndexAndCache();
        note = undefined;
    }

    let isContentChanged = false;
    codeEditor.setValueChangeListener(function(){
        isContentChanged = true;
    });

    function startAutoSaveInterval(){
        idOfAutoSaveInterval = window.setInterval(function(){
            if(isContentChanged) {
                r(function*(){
                    isContentChanged = false;
                    yield* storeNote();
                });
            }
        }, 500);
    }

    register(AppEvent.resultsPage, () => {
        closePreviewWindow();
        window.clearInterval(idOfAutoSaveInterval)
    });

    register(AppEvent.createNewNote, createNewNote);

    register(AppEvent.viewNote, function(noteId: number){
        r(function*(){
            let idb: IDBDatabase = yield getIDB();
            note = yield StorageNamespace.getNote(idb, noteId);
            yield* viewNote();
        });
    });

    editButton.onclick = function(){
        r(editNote);
    };

    viewButton.oncontextmenu = function(evt){
        evt.preventDefault();
        getPreviewWindow().then(function(previewWindow: Window){
            previewWindow.postMessage(note.components, "*");
        });
        return false;
    };

    viewButton.onclick = function(){
        closePreviewWindow();
        setCommandButtons(viewNoteCommandButtons);
        r(function*(){
            yield* storeNote();
            yield* viewNote()
        });
    };

    deleteButton.onclick = function(){
        //todo: ask the user to confirm
        r(deleteNote);
        broadcast(AppEvent.resultsPage);
    };

    //this seemly awkward useless function is called by App.ts to ensure that this search results section module is created first
    export function init(){}

}
