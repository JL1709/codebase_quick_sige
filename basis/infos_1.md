# Wie sieht ein einzelner „Baustein“ genau aus? Besteht jeder Baustein aus Titel, Grafik/Bild, kurzem Text für den A0-Plan, ausführlicherem Text für den A4-Plan und den zugehörigen Vorschriften/Regelwerken? Oder gibt es unterschiedliche Bausteintypen?
Es gibt nur einen Bausteintyp: Bei längeren Überschriften, mehreren Vorschriften ggf. zweizeilige Infos; vorzugsweise aber alles nur 1-zeilig; hängt von den einzelnen Beschreibungen ab. (siehe codebase_quick_sige/basis/old_software_baustein_example.png)
 
# Gibt es für jeden grafischen A0-Baustein einen dazugehörigen ausführlichen Textbaustein für das A4-Dokument? Das wäre für die Automatisierung sehr wichtig: Wird z. B. der Baustein „Arbeitsplatzbeleuchtung“ auf dem A0-Plan ausgewählt und dadurch automatisch ein bestimmter ausführlicher Abschnitt im A4-Dokument erzeugt?
Die Bausteine im Katalog werden zunächst grafisch auf dem großen Plan (meist A0) platziert. Es gibt dann eine Übergabe an eine WORD-Formatvorlage, worin die Bausteine aus dem großen Plan von links nach rechts und oben nach unten als Tabelle mit entsprechenden Formaten der Tabellenzellen übergeben werden (alle Infos aus dem Baustein). Hier zwei von mehreren Bausteinen, es können durch aus 50 sein.
(siehe codebase_quick_sige/basis/old_software_word_export_example.png)

# Wie werden die Bausteine heute verwaltet? Existieren sie bereits als Word-Dateien, Bilder, PDFs, Excel-Tabelle oder in einer bestehenden Software / Datenbank? Hat jeder SiGeKo seine eigenen, über die Jahre angesammelten Bausteine, oder gibt es eine (öffentliche/bezahlte?) Datenbank, aus der man diese beziehen kann? Wie viele sind es ungefähr?
Die Bausteine werden z.Zt. innerhalb des Programmes aus den Bausteinen Bild, Vorschriften, Beschreibung(en) zusammengesetzt und als sogenannter Muttersigeplan mitgeliefert. Kunden können individuelle Ergänzungen vornehmen. Sinnvoll wäre eine Importfunktion, um aktuelle Ergänzungen / Korrekturen – aucn kostenpflichtig – einzuspielen.
(siehe codebase_quick_sige/basis/old_software_bausteinverwaltung.png)
 
# Sollen zusätzliche Informationen  für einen Baustein hinterlegt werden können? Beispielsweise Bauphase, Gewerk, Gefährdung, Maßnahme, Regelwerk, Stichwörter usw., damit man später schnell suchen und filtern kann.
Ja, auch Tags, sodass einfach und schnell ein fertiger erster Entwurf eines SiGe-Plans erstellt wird. Wenn ein SiGeKo einen neuen Plan erstellen will, werden zunächst Standardfrage gestellt, z.B. Bauphase, Jahreszeit, etc. was alles eben wichtig ist. diei Bausteine haben dann noch Tags z.B. "Sommer", sodass dann automatisch dieser herangezogen wird.
 
# Wie soll die Auswahl der Bausteine funktionieren? Nur manuell über Suche/Filter und Drag & Drop – oder wäre es langfristig interessant, dass die Software aufgrund einiger Projektdaten bereits passende Bausteine vorschlägt?
Das könnte schon in Richtung „KI“ gehen: Bauart, Lage der Baustelle, Gründung etc.; Abfrage des Bautyps und generierte Vorschläge
 
# Wie frei soll der A0-Plan aufgebaut werden können? Sollen die Bausteine völlig frei verschoben und in der Größe verändert werden können oder gibt es ein festes Raster bzw. vorgegebene Bereiche wie „Baustellenvorbereitung“, „Erdarbeiten“, „Baustelleneinrichtung“ usw.? Der Beispielplan arbeitet sehr stark mit solchen Gruppen. Soll ggfs. direkt eine erste, komplette Zuordnung erstellt werden?
Es sollten feste Raster verwendet werden, z.B. obere Hälfte die Bausteine, unten Reserveflächen für DINA4-Blätter (Telefonliste, Info, Lageplan); Einfügen zunächst als Grafiken über Vorauswahlfenster
 
# Welche Elemente sind nicht normale Bausteine? Zum Beispiel Lageplan, Baustelleneinrichtungsplan, Alarmplan, Vorankündigung, Projektinformationen, Ansprechpartner oder Firmenlogo. Sollen solche projektspezifischen PDFs/Bilder ebenfalls per Drag & Drop auf den Plan gesetzt werden können?
Per Drag&Drop wäre gut, links Vorauswahlfenster; alternativ (aktuell gegeben) frei platzierbare vordefinierte Boxen
 
# Was ist das endgültige Ausgabeformat des A0-Plans? Reicht ein maßstäblicher PDF-Export zum Drucken oder soll zusätzlich Word, PowerPoint o. Ä. erzeugt werden? Und gibt es ausschließlich A0 oder auch andere Formate wie A1/A2?
Das häufigste Format wäre wohl A0, evtl. noch A1 oder A4. Ausgabe als pdf; als Gesamtausgabe des in der Vorschau angezeigten Planes.
Zur Ausgabe in Richtung WORD s. separate Beschreibung.
 
# Wie genau soll der Word-/A4-Export aussehen? Gibt es dafür bereits ein konkretes Beispiel oder eine Word-Vorlage? Welche Inhalte des A0-Plans werden übernommen, welche zusätzlichen Texte eingefügt und in welcher Reihenfolge?
s. Punkt 2
 
# Wie wichtig ist Versionsverwaltung? Also beispielsweise „Index 0 / Index A / Index B“, Datum, Änderungstext, wer die Änderung vorgenommen hat und ältere Planstände wieder aufrufen. Im Beispielplan ist bereits ein Änderungs-/Indexbereich vorgesehen.
In Abhängigkeit von Client-Server-Lösung / genutzte Datenbank. Im aktuellen Programm gibt es kein Speichern unter o.ä. Jeder Plan wird aber insgesamt abgelegt / gespeichert. Hierzu wird nur eine zahlenmäßige Indizierung vorgenommen und der Plan dann aus den zugeordneten Bausteinen, Grafiken etc. im x-y-Raster zusammengebaut.
 
# Soll zunächst nur eine Person mit der Software arbeiten oder mehrere Mitarbeiter? Daraus ergibt sich, ob Bausteine und Projekte nur lokal oder zentral in einer gemeinsamen Datenbank liegen müssen und ob Benutzerrechte relevant sind.
Multiusermöglichkeit muss letztendlich gegeben sein, mit Anmeldeverwaltung, Zugriffsrechten etc.