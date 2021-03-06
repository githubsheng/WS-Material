///<reference path="AutoComplete.ts"/>
///<reference path="Util.ts"/>
///<reference path="IndexAndCacheBuilder.ts"/>
///<reference path="AppEvents.ts"/>
///<reference path="SearchResultSection.ts"/>
///<reference path="EVNoteSection.ts"/>

namespace AppNamespace {

    import createAutoComplete = UIComponentNamespace.createAutoComplete;
    import createCriterionSection = UIComponentNamespace.createCriterionSection;
    import buildIndexAndCache = IndexAndCacheBuilderNamespace.buildIndexAndCache;
    import r = Utility.r;
    import broadcast = AppEventsNamespace.broadcast;
    import AppEvent = AppEventsNamespace.AppEvent;
    import register = AppEventsNamespace.register;

    let auto = createAutoComplete();
    let newNoteButton = document.createElement("button");
    newNoteButton.appendChild(document.createTextNode("New"));

    newNoteButton.onclick = function () {
        criteriaSection.clearAllSearchCriterion();
        broadcast(AppEvent.createNewNote);
    };

    let clearSearchKeyWordButton = document.createElement("button");
    clearSearchKeyWordButton.appendChild(document.createTextNode("Clear"));
    clearSearchKeyWordButton.onclick = function(){
        criteriaSection.clearAllSearchCriterion();
        broadcast(AppEvent.resultsPage);
    };

    let headerLeft = document.querySelector("#headerLeft");
    headerLeft.appendChild(auto.searchEle);
    headerLeft.appendChild(newNoteButton);
    headerLeft.appendChild(clearSearchKeyWordButton);
    document.body.appendChild(auto.autoCompletionListEle);

    let criteriaSection = createCriterionSection();
    document.body.appendChild(criteriaSection.containerEle);
    auto.setSearchCriterionFunc(criteriaSection.addNewSearchCriterion);

    register(AppEvent.viewNote, criteriaSection.clearAllSearchCriterion);

    SearchResultSectionNamespace.init();
    EVNoteSectionNamespace.init();

    r(function*(){
        yield* buildIndexAndCache();
        document.body.removeChild(document.querySelector("#appLogo"));
        broadcast(AppEvent.resultsPage);
    });

}
